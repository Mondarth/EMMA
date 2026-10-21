import { memoryCache } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, test, vi } from 'vitest';

import { createVersionJudge } from '@module/adapters/versions';
import type { FoundryMockOptions, ModuleMockData } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const INDEX = 'https://r2.foundryvtt.com/package-api-public/index-latest.json';
const DETAILS = 'https://r2.foundryvtt.com/package-api-public/detail/{id}.json';
const PROXY = 'https://proxy.test/?url={url}';
const RELEASE_NOTES = 'https://foundryvtt.com/releases/';

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
 * Foundry's release notes page, listing builds with their channels.
 * @param builds - Each build and its channel
 * @returns The page's URL and HTML
 */
function releaseNotes(builds: [string, string][]): [string, string] {
  const html = builds
    .map(([build, channel]) => `<a href="/releases/${build}">Release ${build}</a><span class="release-tag ${channel}">`)
    .join('\n');
  return [RELEASE_NOTES, `<html><body>${html}</body></html>`];
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
 * @param routes - The JSON, or for a string the text, to answer each URL with
 * @returns The fetch
 */
function fakeFetch(routes: [string, unknown][]) {
  const answers = new Map(routes);
  return vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    const body = answers.get(url);
    if (body === undefined) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(typeof body === 'string' ? new Response(body) : Response.json(body));
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

    expect(judge.judgeChoices(['dice'], { modules: new Map() }).get('dice')?.badge?.type).toBe('success');
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

    const judged = judge.judgeVersions(active, { modules: new Map() }, 'dice');
    expect(judged.map(({ version, badge }) => [version, badge?.type, badge?.tooltip])).toEqual([
      ['2.0.0', 'error', `availability ${String(UNKNOWN)}`],
      ['1.0.0', 'success', `availability ${String(VERIFIED)}`],
    ]);
    expect(foundry.getVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({ id: 'dice', version: '1.0.0', compatibility: { minimum: '14', verified: '14' } }),
      expect.anything(),
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

    const [newest, listed] = judge.judgeVersions(['dice'], { modules: new Map() }, 'dice');
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

    const chosen = judge.judgeChoices(active, { modules: new Map() });

    expect([...chosen].map(([id, { version, badge }]) => [id, version, badge?.type])).toEqual([
      ['lib', '2.0.0', 'success'],
      ['addon', '1.0.0', 'success'],
    ]);
  });

  test('judges every module in the setup the choices make', async () => {
    const { judge, active } = await lookUp({ modules }, routes);

    const chosen = judge.judgeChoices(active, { modules: new Map([['lib', '3.0.0']]) });

    expect(chosen.get('lib')?.version).toBe('3.0.0');
    expect(chosen.get('addon')?.badge?.tooltip).toBe(`availability ${String(MISSING_DEPENDENCY)}`);
  });

  test('judges only the modules of the setup, as a module staged inactive is missing from it', async () => {
    const { judge } = await lookUp({ modules }, routes);

    const chosen = judge.judgeChoices(['addon', 'missing'], { modules: new Map() });

    expect([...chosen.keys()]).toEqual(['addon']);
    expect(chosen.get('addon')?.badge?.tooltip).toBe(`availability ${String(MISSING_DEPENDENCY)}`);
  });

  test('judges each version of a module with the other modules at their chosen versions', async () => {
    const { judge, foundry, active } = await lookUp({ modules }, routes);

    const judged = judge.judgeVersions(active, { modules: new Map() }, 'addon');
    const [newest] = judge.judgeVersions(active, { modules: new Map([['addon', '1.0.0']]) }, 'lib');

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
      expect.anything(),
    );
  });

  test('has no versions to judge for a module not looked up', async () => {
    const { judge, active } = await lookUp({ modules }, routes);

    expect(judge.judgeVersions(active, { modules: new Map() }, 'missing')).toEqual([]);
  });
});

describe('the core and the system', () => {
  const proxied = (routes: [string, unknown][]): [string, unknown][] =>
    routes.map(([url, body]) => [PROXY.replace('{url}', encodeURIComponent(url)), body]);
  const systemManifest = 'https://example.test/dnd5e/system.json';
  const system = { id: 'dnd5e', title: 'D&D 5e', manifest: systemManifest };
  /** The system's newer release, from its manifest URL. */
  const newerSystem: [string, unknown] = [
    systemManifest,
    { id: 'dnd5e', title: 'D&D 5e', version: '5.2.0', compatibility: { minimum: '14', verified: '14' } },
  ];
  const notes = releaseNotes([
    ['15.380', 'prototype'],
    ['14.370', 'testing'],
    ['14.369', 'stable'],
    ['14.368', 'stable'],
    ['14.360', 'stable'],
  ]);
  const modules = {
    dice: {
      active: true,
      title: 'Dice & Co',
      version: '1.0.0',
      compatibility: { minimum: '14', verified: '14', maximum: '14.368' },
      systems: [{ id: 'dnd5e', compatibility: { maximum: '5.1.0' } }],
    },
  };

  test('without a proxy, offers only the core in use, never reading Foundry’s release notes', async () => {
    const { judge, send } = await lookUp({ modules, system }, [newerSystem]);

    expect(judge.proxied).toBe(false);
    expect(judge.platformVersions('core')).toEqual(['14.368']);
    expect(send.mock.calls.map(([url]) => urlOf(url))).not.toContain(RELEASE_NOTES);
    expect(judge.unreached).toEqual([]);
  });

  test('through a proxy, offers the newer builds on the core’s channel or a more stable one', async () => {
    const { judge, send } = await lookUp({ modules, system }, proxied([newerSystem, notes]), PROXY);
    await judge.lookUp(['dice']);

    expect(judge.proxied).toBe(true);
    expect(judge.platformVersions('core')).toEqual(['14.369', '14.368']);
    // The release notes are read once, with the system.
    const asked = send.mock.calls.map(([url]) => urlOf(url));
    expect(asked.filter(url => url === PROXY.replace('{url}', encodeURIComponent(RELEASE_NOTES)))).toHaveLength(1);
  });

  test('offers testing builds too while on one', async () => {
    const mocks = installFoundryMocks({ modules, system, version: '14.368' });
    Object.assign(mocks.game.release, { channel: 'testing' });
    const judge = createVersionJudge({ proxy: PROXY, fetch: fakeFetch(proxied([notes])), cache: memoryCache() });
    await judge.lookUp(['dice']);

    expect(judge.platformVersions('core')).toEqual(['14.370', '14.369', '14.368']);
  });

  test('names the core as not reached when the release notes could not be read', async () => {
    const { judge } = await lookUp({ modules, system }, proxied([newerSystem]), PROXY);

    expect(judge.unreached).toContainEqual({ type: 'core', id: 'core' });
    expect(judge.platformVersions('core')).toEqual(['14.368']);
  });

  test('offers the system in use and its newer versions, newest first', async () => {
    const { judge } = await lookUp({ modules, system }, [newerSystem]);

    expect(judge.platformVersions('system')).toEqual(['5.2.0', '5.1.0']);
  });

  test('judges every module with the core and the system chosen', async () => {
    const { judge, active } = await lookUp({ modules, system }, proxied([newerSystem, notes]), PROXY);

    expect(judge.judgeChoices(active, { modules: new Map() }).get('dice')?.badge?.type).toBe('success');
    expect(judge.judgeChoices(active, { system: '5.2.0', modules: new Map() }).get('dice')?.badge?.type).toBe(
      'warning',
    );
    expect(judge.judgeChoices(active, { core: '14.369', modules: new Map() }).get('dice')?.badge?.type).toBe('error');
    // A module's versions are judged with them too.
    const [installed] = judge.judgeVersions(active, { system: '5.2.0', modules: new Map() }, 'dice');
    expect(installed?.badge?.type).toBe('warning');
  });

  test('judges each core or system version by the worst fit it leaves, naming what does not fit', async () => {
    const { judge, active, foundry } = await lookUp({ modules, system }, proxied([newerSystem, notes]), PROXY);

    const systems = judge.judgePlatform(active, { modules: new Map() }, 'system');
    const cores = judge.judgePlatform(active, { modules: new Map() }, 'core');

    expect(systems.map(({ version, badge }) => [version, badge?.type])).toEqual([
      ['5.2.0', 'warning'],
      ['5.1.0', 'success'],
    ]);
    expect(systems[0]?.badge?.text).toBe('MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Dice & Co"}');
    // The tooltip is HTML, so the titles in it are escaped.
    expect(systems[0]?.badge?.tooltip).toBe('MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Dice &amp; Co"}');
    expect(systems[0]?.badge?.icon).toBe('fa-solid icon-3');
    expect(systems[1]?.badge).toEqual({
      type: 'success',
      icon: 'fa-solid fa-code-branch',
      tooltip: 'MONDARTH-EMMA.Versions.Fit.Verified',
      text: 'MONDARTH-EMMA.Versions.Fit.Verified',
    });
    expect(cores.map(({ version, badge }) => [version, badge?.type])).toEqual([
      ['14.369', 'error'],
      ['14.368', 'success'],
    ]);
    expect(cores[0]?.badge?.text).toBe('MONDARTH-EMMA.Versions.Fit.Unusable {"packages":"Dice & Co"}');
    // The system's badge is the system's own.
    expect(foundry.systemVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({ id: 'dnd5e', version: '5.1.0' }),
      expect.anything(),
    );
  });

  test('gives Foundry the setup’s system and modules to name what does not suit, as a world has no game.systems', async () => {
    const lib = { active: true, title: 'Lib', version: '1.0.0', compatibility: { minimum: '14', verified: '14' } };
    const { judge, active, foundry } = await lookUp(
      { modules: { ...modules, lib, idle: { version: '1.0.0' } }, system },
      [newerSystem],
    );

    const chosen = judge.judgeChoices(active, { system: '5.2.0', modules: new Map() });

    expect(chosen.get('dice')?.badge?.type).toBe('warning');
    const options = foundry.getVersionBadge.mock.calls.find(([, data]) => data.version === '1.0.0')?.[2] as {
      systems: Map<string, { version: string; unavailable: boolean }>;
      modules: Map<string, unknown>;
    };
    expect([...options.systems]).toEqual([['dnd5e', { id: 'dnd5e', version: '5.2.0', unavailable: false }]]);
    // Only the modules in the setup, so a module installed but not staged active counts as missing.
    expect([...options.modules.keys()].sort()).toEqual(['dice', 'lib']);
  });

  test('names both what will not work and what may not', async () => {
    // Verified only with an older generation of Foundry, so it may not work with any build of 14.
    const lib = { active: true, title: 'Lib', version: '1.0.0', compatibility: { minimum: '13', verified: '13' } };
    const { judge, active } = await lookUp(
      { modules: { ...modules, lib }, system },
      proxied([newerSystem, notes]),
      PROXY,
    );

    const [newest] = judge.judgePlatform(active, { modules: new Map() }, 'core');

    expect(newest?.badge?.text).toBe(
      'MONDARTH-EMMA.Versions.Fit.Unusable {"packages":"Dice & Co"} MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Lib"}',
    );
    expect(newest?.badge?.tooltip).toBe(
      'MONDARTH-EMMA.Versions.Fit.Unusable {"packages":"Dice &amp; Co"}<br>MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Lib"}',
    );
  });
});
