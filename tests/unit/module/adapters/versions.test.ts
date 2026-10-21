import { memoryCache } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, test, vi } from 'vitest';

import { createVersionJudge } from '@module/adapters/versions';
import type { FoundryMockOptions, ModuleMockData } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const INDEX = 'https://r2.foundryvtt.com/package-api-public/index-latest.json';
const DETAILS = 'https://r2.foundryvtt.com/package-api-public/detail/{id}.json';
const PROXY = 'https://proxy.test/?url={url}';

/** Availability codes, as Foundry numbers them. */
const VERIFIED = 1;
const UNKNOWN = 0;
const MISSING_DEPENDENCY = 6;
const REQUIRES_CORE_UPGRADE_UNKNOWN = 10;

/**
 * A module published on GitHub, whose manifest points at its latest release.
 * @param repo - The repository, `<owner>/<repo>`
 * @param data - The rest of the module
 * @returns The module's mock data
 */
function onGithub(repo: string, data: ModuleMockData): ModuleMockData {
  return {
    active: true,
    links: { manifest: `https://github.com/${repo}/releases/latest/download/module.json` },
    compatibility: { minimum: '14', verified: '14' },
    ...data,
  };
}

/**
 * GitHub's list of a repository's releases, each with a module manifest attached.
 * @param repo - The repository, `<owner>/<repo>`
 * @param versions - The versions released
 * @returns The URL GitHub lists them at, and the list
 */
function githubReleases(repo: string, versions: string[]): [string, unknown] {
  return [
    `https://api.github.com/repos/${repo}/releases?per_page=100`,
    versions.map(version => ({
      tag_name: `v${version}`,
      assets: [
        {
          name: 'module.json',
          browser_download_url: `https://github.com/${repo}/releases/download/v${version}/module.json`,
        },
      ],
    })),
  ];
}

/**
 * The URL fetch was given.
 * @param input - What fetch was given
 * @returns The URL
 */
function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

/**
 * A fetch that answers the URLs given, and fails as a browser does for any other: blocked, as by CORS.
 * @param routes - The JSON to answer each URL with
 * @returns The fetch
 */
function fakeFetch(routes: [string, unknown][]) {
  const answers = new Map(routes);
  return vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    const body = answers.get(url);
    return body === undefined ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(Response.json(body));
  });
}

/**
 * Install the Foundry mocks and look up the versions of the modules given that are active.
 * @param options - The mock state
 * @param routes - The JSON to answer each URL with
 * @param proxy - The proxy URL template, if any
 * @returns The versions found, with the fetch used and the Foundry mocks
 */
async function lookUp(options: FoundryMockOptions, routes: [string, unknown][], proxy: string | null = null) {
  const mocks = installFoundryMocks(options);
  const send = fakeFetch(routes);
  const judge = createVersionJudge({ proxy, fetch: send, cache: memoryCache() });
  const active = Object.entries(options.modules ?? {}).flatMap(([id, data]) => (data.active === true ? [id] : []));
  await judge.lookUp(active);
  return { judge, send, active, ...mocks };
}

describe('createVersionJudge without a proxy', () => {
  test('offers the installed version and the newer ones GitHub releases, newest first', async () => {
    const { judge } = await lookUp({ modules: { dice: onGithub('owner/dice', { version: '5.2.4' }) } }, [
      githubReleases('owner/dice', ['5.1.0', '5.3.0', '6.0.0']),
    ]);

    expect(judge.versionsOf('dice')).toEqual(['6.0.0', '5.3.0', '5.2.4']);
  });

  test('fetches nothing until asked, and looks each module up once, the system with the first', async () => {
    installFoundryMocks({
      modules: { dice: onGithub('owner/dice', {}), lib: onGithub('owner/lib', {}) },
      system: { id: 'dnd5e', title: 'D&D 5e', manifest: 'https://example.test/dnd5e/system.json' },
    });
    const send = fakeFetch([githubReleases('owner/dice', ['2.0.0']), githubReleases('owner/lib', ['2.0.0'])]);
    const judge = createVersionJudge({ proxy: null, fetch: send, cache: memoryCache() });
    const asked = () => send.mock.calls.map(([url]) => urlOf(url));
    expect(send).not.toHaveBeenCalled();
    expect(judge.versionsOf('dice')).toEqual([]);

    await judge.lookUp(['dice', 'missing']);
    const first = asked();
    await judge.lookUp(['dice']);
    await judge.lookUp(['dice', 'lib']);

    expect(first).toContain('https://example.test/dnd5e/system.json');
    expect(first).not.toContain(githubReleases('owner/lib', [])[0]);
    expect(asked().slice(first.length)).toEqual([githubReleases('owner/lib', [])[0]]);
    expect(judge.versionsOf('lib')).toEqual(['2.0.0', '1.0.0']);
  });

  test('looks a module up again after a lookup failed', async () => {
    installFoundryMocks({ modules: { dice: onGithub('owner/dice', {}) } });
    const cache = memoryCache();
    const failure = new Error('storage full');
    const flaky = { get: vi.fn(cache.get).mockRejectedValueOnce(failure), set: cache.set };
    const judge = createVersionJudge({
      proxy: null,
      fetch: fakeFetch([githubReleases('owner/dice', ['2.0.0'])]),
      cache: flaky,
    });

    await expect(judge.lookUp(['dice'])).rejects.toBe(failure);
    await judge.lookUp(['dice']);

    expect(judge.versionsOf('dice')).toEqual(['2.0.0', '1.0.0']);
  });

  test('reads a core release channel it does not know as stable', async () => {
    const mocks = installFoundryMocks({ modules: { dice: onGithub('owner/dice', { version: '1.0.0' }) } });
    Object.assign(mocks.game.release, { channel: 'nightly' });

    const judge = createVersionJudge({
      proxy: null,
      fetch: fakeFetch([githubReleases('owner/dice', [])]),
      cache: memoryCache(),
    });
    await judge.lookUp(['dice']);

    expect(judge.judgeChoices(['dice'], new Map()).get('dice')?.badge?.type).toBe('success');
  });

  test('never asks for Foundry’s listing, which browsers may not read', async () => {
    const { send } = await lookUp({ modules: { dice: onGithub('owner/dice', {}) } }, [
      githubReleases('owner/dice', ['1.0.0']),
    ]);

    expect(send.mock.calls.map(([url]) => urlOf(url))).not.toContain(INDEX);
  });

  test('lists only the installed version of a module found nowhere else', async () => {
    const { judge } = await lookUp({ modules: { local: { active: true, version: '0.1.0' } } }, []);

    expect(judge.versionsOf('local')).toEqual(['0.1.0']);
  });

  test('lists nothing for a module not looked up', async () => {
    const { judge } = await lookUp({ modules: { dice: onGithub('owner/dice', { active: false }) } }, [
      githubReleases('owner/dice', ['2.0.0']),
    ]);

    expect(judge.versionsOf('dice')).toEqual([]);
  });

  test('names the packages whose versions could not all be read', async () => {
    const { judge } = await lookUp(
      { modules: { dice: { active: true, links: { manifest: 'https://example.test/dice/module.json' } } } },
      [],
    );

    expect(judge.unreached).toEqual([{ type: 'module', id: 'dice' }]);
  });

  test('reads a manifest from a site that sends CORS headers', async () => {
    const manifest = 'https://example.test/dice/module.json';
    const { judge } = await lookUp({ modules: { dice: { active: true, version: '1.0.0', links: { manifest } } } }, [
      [manifest, { id: 'dice', title: 'Dice', version: '1.1.0', compatibility: { minimum: '14', verified: '14' } }],
    ]);

    expect(judge.versionsOf('dice')).toEqual(['1.1.0', '1.0.0']);
    expect(judge.unreached).toEqual([]);
  });

  test('judges the installed version on its manifest, and a version known only from a release list as unknown', async () => {
    const { judge, foundry, active } = await lookUp(
      { modules: { dice: onGithub('owner/dice', { version: '1.0.0' }) } },
      [githubReleases('owner/dice', ['2.0.0'])],
    );

    const judged = judge.judgeVersions(active, new Map(), 'dice');
    expect(judged.map(({ version, badge }) => [version, badge?.type, badge?.tooltip])).toEqual([
      ['2.0.0', 'error', `availability ${String(UNKNOWN)}`],
      ['1.0.0', 'success', `availability ${String(VERIFIED)}`],
    ]);
    expect(foundry.getVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({ id: 'dice', version: '1.0.0', compatibility: { minimum: '14', verified: '14' } }),
      {},
    );
  });
});

describe('createVersionJudge through a proxy', () => {
  const index: [string, unknown] = [
    INDEX,
    { details: DETAILS, packages: [{ id: 'dice', type: 'module', last_updated: '2026-10-01' }] },
  ];
  const details: [string, unknown] = [
    DETAILS.replace('{id}', 'dice'),
    {
      versions: [
        { version: '2.0.0', manifest: 'https://example.test/2.0.0/module.json', minimum: '15', verified: '15' },
        { version: '1.5.0', manifest: 'https://example.test/1.5.0/module.json', minimum: '14', verified: '14' },
      ],
    },
  ];
  const proxied = (routes: [string, unknown][]): [string, unknown][] =>
    routes.map(([url, body]) => [PROXY.replace('{url}', encodeURIComponent(url)), body]);

  test('asks the proxy for every URL, Foundry’s listing among them', async () => {
    const { send, judge } = await lookUp(
      { modules: { dice: onGithub('owner/dice', { version: '1.0.0' }) } },
      proxied([index, details, githubReleases('owner/dice', [])]),
      PROXY,
    );

    const urls = send.mock.calls.map(([url]) =>
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    expect(urls.every(url => url.startsWith('https://proxy.test/?url='))).toBe(true);
    expect(urls).toContain(PROXY.replace('{url}', encodeURIComponent(INDEX)));
    expect(judge.versionsOf('dice')).toEqual(['2.0.0', '1.5.0', '1.0.0']);
  });

  test('shows a version that needs a newer Foundry, judged so', async () => {
    const { judge } = await lookUp(
      { modules: { dice: onGithub('owner/dice', { version: '1.0.0' }) } },
      proxied([index, details, githubReleases('owner/dice', [])]),
      PROXY,
    );

    const [newest, listed] = judge.judgeVersions(['dice'], new Map(), 'dice');
    expect(newest?.badge?.tooltip).toBe(`availability ${String(REQUIRES_CORE_UPGRADE_UNKNOWN)}`);
    expect(listed?.badge?.tooltip).toBe(`availability ${String(VERIFIED)}`);
  });
});

describe('judging choices', () => {
  const modules = {
    lib: onGithub('owner/lib', { version: '2.0.0' }),
    addon: onGithub('owner/addon', {
      version: '1.0.0',
      requires: [{ id: 'lib', compatibility: { maximum: '2.0.0' } }],
      systems: ['dnd5e'],
    }),
  };
  const routes = [githubReleases('owner/lib', ['3.0.0']), githubReleases('owner/addon', [])];

  test('gives each module of the setup its installed version and badge until another is chosen', async () => {
    const { judge, active } = await lookUp({ modules }, routes);

    const chosen = judge.judgeChoices(active, new Map());

    expect([...chosen].map(([id, { version, badge }]) => [id, version, badge?.type])).toEqual([
      ['lib', '2.0.0', 'success'],
      ['addon', '1.0.0', 'success'],
    ]);
  });

  test('judges every module in the setup the choices make', async () => {
    const { judge, active } = await lookUp({ modules }, routes);

    const chosen = judge.judgeChoices(active, new Map([['lib', '3.0.0']]));

    expect(chosen.get('lib')?.version).toBe('3.0.0');
    expect(chosen.get('addon')?.badge?.tooltip).toBe(`availability ${String(MISSING_DEPENDENCY)}`);
  });

  test('judges only the modules of the setup, as a module staged inactive is missing from it', async () => {
    const { judge } = await lookUp({ modules }, routes);

    const chosen = judge.judgeChoices(['addon', 'missing'], new Map());

    expect([...chosen.keys()]).toEqual(['addon']);
    expect(chosen.get('addon')?.badge?.tooltip).toBe(`availability ${String(MISSING_DEPENDENCY)}`);
  });

  test('judges each version of a module with the other modules at their chosen versions', async () => {
    const { judge, foundry, active } = await lookUp({ modules }, routes);

    const judged = judge.judgeVersions(active, new Map(), 'addon');
    const [newest] = judge.judgeVersions(active, new Map([['addon', '1.0.0']]), 'lib');

    expect(judged.map(({ version }) => version)).toEqual(['1.0.0']);
    expect(newest?.version).toBe('3.0.0');
    // Foundry names the dependencies from the release's relationships.
    expect(foundry.getVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({
        relationships: {
          requires: [expect.objectContaining({ id: 'lib', type: 'module', compatibility: { maximum: '2.0.0' } })],
          systems: [expect.objectContaining({ id: 'dnd5e', type: 'system' })],
        },
      }),
      {},
    );
  });

  test('has no versions to judge for a module not looked up', async () => {
    const { judge, active } = await lookUp({ modules }, routes);

    expect(judge.judgeVersions(active, new Map(), 'missing')).toEqual([]);
  });
});
