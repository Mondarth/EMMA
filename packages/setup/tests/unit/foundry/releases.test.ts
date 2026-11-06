import type { Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test, vi } from 'vitest';

import { lookUpReleases } from '../../../src/foundry/releases';
import type { InstalledManifests, PackageManifest } from '../../../src/foundry/setup-game';
import { KIT } from '../../mocks/kit';

const CORE = { version: '14.368', generation: 14, channel: 'stable' };
const CATALOGUE = { url: 'https://catalogue.example.test/', key: 'catalogue-k3y' };
const LOOKUP = 'https://catalogue.example.test/api/v2/lookup';
const MANIFEST = 'https://catalogue.example.test/api/v2/manifest';

/**
 * An installed module's manifest.
 * @param id - Its ID
 * @param version - Its version
 * @param manifest - The manifest URL it declares, if any
 * @returns The manifest
 */
function moduleManifest(id: string, version: string, manifest?: string): PackageManifest {
  return {
    type: 'module',
    id,
    version,
    json: { id, title: id, version, compatibility: { minimum: '14', verified: '14' }, ...(manifest && { manifest }) },
    origin: `modules/${id}/module.json`,
    ...(manifest !== undefined && { manifest }),
  };
}

/**
 * A release as the catalogue gives it, without its package.
 * @param version - Its version
 * @param more - Anything else it has
 * @returns The release
 */
function held(version: string, more: Record<string, unknown> = {}) {
  return {
    version,
    compatibility: { minimum: '14', verified: '14' },
    relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
    protected: false,
    origin: `https://packages.example.test/${version}/module.json`,
    detail: 'loaded',
    ...more,
  };
}

/**
 * A package as the catalogue's lookup gives it.
 * @param id - The module's ID
 * @param releases - Its releases
 * @param own - The version its own manifest last gave
 * @param latest - The newest version Foundry's listing gives
 * @returns The package
 */
function looked(id: string, releases: unknown[], own: string | null = null, latest: string | null = null) {
  return {
    package: { type: 'module', id },
    title: id,
    latest,
    premium: false,
    syncedAt: '2026-11-06T10:00:00.000Z',
    own: { version: own, readAt: null, checkedAt: '2026-11-06T10:00:00.000Z' },
    releases,
  };
}

/**
 * What the catalogue's lookup answers.
 * @param more - What it gives, beside nothing
 * @returns The answer
 */
function answer(more: Record<string, unknown> = {}) {
  return { core: [], packages: [], pending: [], unavailable: [], unreached: [], asOf: null, ...more };
}

/**
 * A fetch that answers the catalogue's endpoints from what each is sent, and every other URL with a 404.
 * @param routes - The JSON to answer each endpoint's request body with, or a status to fail with
 * @returns The fetch, a spy
 */
function catalogue(routes: Readonly<Record<string, (body: unknown) => unknown>>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const answered = routes[url]?.(body);
    return Promise.resolve(
      answered === undefined
        ? new Response('Not found', { status: 404 })
        : typeof answered === 'number'
          ? new Response('Failed', { status: answered })
          : new Response(JSON.stringify(answered), { headers: { 'Content-Type': 'application/json' } }),
    );
  });
}

/**
 * The requests a fetch was sent, with their bodies and headers.
 * @param send - The fetch
 * @returns The requests
 */
function sentBy(send: ReturnType<typeof catalogue>) {
  return send.mock.calls.map(([input, init]) => ({
    url: input instanceof Request ? input.url : input.toString(),
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    headers: new Headers(init?.headers),
  }));
}

/**
 * The releases, each as `id@version`, sorted.
 * @param releases - The releases
 * @returns Their names
 */
function versions(releases: readonly Release[]): string[] {
  return releases.map(({ package: { id }, version }) => `${id}@${version}`).sort();
}

describe('lookUpReleases', () => {
  test('without a catalogue, knows only what is installed, and asks nothing', async () => {
    const send = catalogue({});
    const installed: InstalledManifests = {
      core: { ...CORE, channel: 'unheard-of' },
      manifests: [moduleManifest('lib', '1.0.0', 'https://packages.example.test/lib/module.json')],
    };

    const found = await lookUpReleases(installed, { kit: KIT, catalogue: null, fetch: send });

    expect(send).not.toHaveBeenCalled();
    expect(found.universe.core).toEqual([{ ...CORE, channel: 'stable' }]);
    expect(versions(found.universe.releases)).toEqual(['lib@1.0.0']);
    expect(found.unreached).toEqual(['module:lib', 'core']);
    await expect(found.load([])).resolves.toEqual([]);
    await expect(found.lookUp([{ type: 'module', id: 'dice' }])).resolves.toEqual([]);
    await expect(found.readManifest('https://example.org/dice/module.json', 'module')).resolves.toEqual({
      ok: false,
      problem: 'no-catalogue',
    });
  });

  test('asks the catalogue once, with what is installed, from the installed generation on', async () => {
    const send = catalogue({
      [LOOKUP]: () =>
        answer({
          core: [CORE, { version: '14.370', generation: 14, channel: 'testing' }],
          packages: [looked('lib', [held('1.0.0'), held('2.0.0')])],
          unavailable: [{ package: { type: 'module', id: 'gone' }, reason: 'archived' }],
          // A package needed but not installed is not among the unreached here.
          unreached: [
            { type: 'module', id: 'lib' },
            { type: 'module', id: 'needed' },
          ],
        }),
    });
    const installed: InstalledManifests = {
      core: CORE,
      manifests: [
        moduleManifest('lib', '1.0.0', 'https://packages.example.test/lib/module.json'),
        moduleManifest('gone', '1.0.0'),
        // A manifest URL the catalogue would refuse is not sent.
        moduleManifest('local', '0.1.0', 'modules/local/module.json'),
        // A manifest Foundry gave that cannot be read gives nothing.
        { ...moduleManifest('broken', '1.0.0'), json: null },
      ],
    };

    const found = await lookUpReleases(installed, {
      kit: KIT,
      catalogue: CATALOGUE,
      clientVersion: '0.3.0',
      fetch: send,
    });

    const requests = sentBy(send);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toEqual({
      packages: [
        { type: 'module', id: 'lib', installed: '1.0.0', manifest: 'https://packages.example.test/lib/module.json' },
        { type: 'module', id: 'gone', installed: '1.0.0' },
        { type: 'module', id: 'local', installed: '0.1.0' },
        { type: 'module', id: 'broken', installed: '1.0.0' },
      ],
      fromGeneration: 14,
    });
    expect(requests[0]?.headers.get('X-API-Key')).toBe('catalogue-k3y');
    expect(requests[0]?.headers.get('X-Catalogue-Client')).toBe('EMMA-extension/0.3.0');
    expect(found.universe.core).toEqual([CORE, { version: '14.370', generation: 14, channel: 'testing' }]);
    // The installed releases the catalogue does not give are added from their manifests.
    expect(versions(found.universe.releases)).toEqual(['gone@1.0.0', 'lib@1.0.0', 'lib@2.0.0', 'local@0.1.0']);
    expect([...found.unavailable]).toEqual(['module:gone']);
    expect(found.unreached).toEqual(['module:lib']);
    await expect(found.load([])).resolves.toEqual([]);
  });

  test('names no client without a version', async () => {
    const send = catalogue({ [LOOKUP]: () => answer() });

    await lookUpReleases(
      { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
      { kit: KIT, catalogue: CATALOGUE, fetch: send },
    );

    expect(sentBy(send)[0]?.headers.has('X-Catalogue-Client')).toBe(false);
  });

  test('keeps what is installed when the catalogue cannot be reached, saying every package is unreached', async () => {
    const send = catalogue({ [LOOKUP]: () => 503 });

    const found = await lookUpReleases(
      { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
      { kit: KIT, catalogue: CATALOGUE, fetch: send },
    );

    expect(found.universe.core).toEqual([CORE]);
    expect(versions(found.universe.releases)).toEqual(['lib@1.0.0']);
    expect(found.unreached).toEqual(['module:lib', 'core']);
  });

  test("takes the version a package's own manifest gives now as installable from it", async () => {
    const url = 'https://packages.example.test/content/module.json';
    const lookUp = (releases: unknown[], own: string | null) =>
      lookUpReleases(
        { core: CORE, manifests: [moduleManifest('content', '1.0.35', url)] },
        {
          kit: KIT,
          catalogue: CATALOGUE,
          fetch: catalogue({ [LOOKUP]: () => answer({ packages: [looked('content', releases, own)] }) }),
        },
      );
    const shown = (releases: readonly Release[]) =>
      releases.map(({ version, versionManifest, unlisted }) => ({ version, versionManifest, unlisted }));

    // The catalogue holds 1.0.36 as unlisted, Foundry's listing having only 1.0.35; the manifest gives 1.0.36.
    const listed = await lookUp([held('1.0.35'), held('1.0.36', { unlisted: true })], '1.0.36');
    expect(shown(listed.universe.releases)).toEqual([
      { version: '1.0.35', versionManifest: undefined, unlisted: undefined },
      { version: '1.0.36', versionManifest: url, unlisted: undefined },
    ]);

    // A version the catalogue does not hold yet is pending there, so is not known here.
    const pending = await lookUp([held('1.0.35')], '1.0.37');
    expect(shown(pending.universe.releases)).toEqual([
      { version: '1.0.35', versionManifest: undefined, unlisted: undefined },
    ]);
  });

  test('installs from a "latest" manifest at the version it gives now', async () => {
    const url = 'https://packages.example.test/app/module.json';
    const fromLatest = (version: string) => held(version, { manifest: url, origin: url });
    const newest = async (own: string | null, latest: string | null) => {
      const packages = [looked('app', [fromLatest('1.0.0'), fromLatest('2.0.0')], own, latest)];
      const found = await lookUpReleases(
        { core: CORE, manifests: [moduleManifest('app', '1.0.0')] },
        { kit: KIT, catalogue: CATALOGUE, fetch: catalogue({ [LOOKUP]: () => answer({ packages }) }) },
      );
      return found.universe.releases.map(({ version, versionManifest }) => `${version} ${versionManifest ?? '-'}`);
    };

    await expect(newest(null, null)).resolves.toEqual(['1.0.0 -', `2.0.0 ${url}`]);
    // What the manifest gives now outweighs Foundry's listing.
    await expect(newest('2.0.0', '1.0.0')).resolves.toEqual(['1.0.0 -', `2.0.0 ${url}`]);
    await expect(newest(null, '2.0.0')).resolves.toEqual(['1.0.0 -', `2.0.0 ${url}`]);
    // The manifest gives a version the catalogue does not hold yet: 2.0.0 is no longer what it gives.
    await expect(newest('3.0.0', '2.0.0')).resolves.toEqual(['1.0.0 -', '2.0.0 -']);
  });

  test("looks up a package to install anew, by the manifest URL Foundry's listing gives", async () => {
    const url = 'https://packages.example.test/dice/module.json';
    const send = catalogue({
      [LOOKUP]: body =>
        (body as { packages: { id: string }[] }).packages.some(({ id }) => id === 'dice')
          ? answer({ packages: [looked('dice', [held('3.0.0')])] })
          : answer(),
    });
    const found = await lookUpReleases(
      { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
      { kit: KIT, catalogue: CATALOGUE, fetch: send },
    );

    const releases = await found.lookUp([{ type: 'module', id: 'dice' }], { 'module:dice': ['not a URL', url] });

    expect(versions(releases)).toEqual(['dice@3.0.0']);
    expect(sentBy(send)[1]?.body).toEqual({
      packages: [{ type: 'module', id: 'dice', manifest: url }],
      fromGeneration: 14,
    });
    await found.lookUp([{ type: 'module', id: 'dice' }]);
    expect(sentBy(send)[2]?.body).toEqual({ packages: [{ type: 'module', id: 'dice' }], fromGeneration: 14 });
  });

  test('reads a manifest the user gives through the catalogue, as the version it names, from its own URL', async () => {
    const url = 'https://example.org/dice/module.json';
    const send = catalogue({
      [MANIFEST]: body => {
        const { url: asked } = body as { url: string };
        if (asked === url) {
          return { ok: true, title: 'Dice', release: { ...held('1.2.0'), package: { type: 'module', id: 'dice' } } };
        }
        if (asked.includes('down')) return 502;
        return { ok: false, problem: 'unreadable', reason: 'refused', host: 'example.org' };
      },
    });
    const found = await lookUpReleases({ core: CORE, manifests: [] }, { kit: KIT, catalogue: CATALOGUE, fetch: send });

    await expect(found.readManifest(url, 'module')).resolves.toMatchObject({
      ok: true,
      title: 'Dice',
      release: { package: { type: 'module', id: 'dice' }, version: '1.2.0', manifest: url, versionManifest: url },
    });
    expect(sentBy(send).find(({ url: sent }) => sent === MANIFEST)?.body).toEqual({ url, type: 'module' });
    await expect(found.readManifest('https://example.org/private/module.json', 'module')).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      reason: 'refused',
      host: 'example.org',
    });
    await expect(found.readManifest('https://example.org/down/module.json', 'module')).resolves.toEqual({
      ok: false,
      problem: 'no-catalogue',
    });
  });

  describe('what the catalogue says beside the releases', () => {
    const RECHECK = 'https://catalogue.example.test/api/v2/recheck';

    test('says how fresh the installed packages are, what it is fetching, and checks them again when asked', async () => {
      const send = catalogue({
        [LOOKUP]: () =>
          answer({
            packages: [
              {
                ...looked('lib', [held('1.0.0')]),
                own: { version: null, readAt: null, checkedAt: '2026-11-06T10:00:00.000Z' },
              },
              {
                ...looked('dice', [held('1.0.0')]),
                own: { version: null, readAt: null, checkedAt: '2026-11-06T09:00:00.000Z' },
              },
              { ...looked('new', [held('1.0.0')]), own: { version: null, readAt: null, checkedAt: null } },
              // A package needed, not installed, says nothing of how fresh the installed ones are.
              {
                ...looked('needed', [held('1.0.0')]),
                own: { version: null, readAt: null, checkedAt: '2026-11-01T00:00:00.000Z' },
              },
            ],
            pending: [
              { package: { type: 'module', id: 'fresh' }, retryAfter: 30 },
              { package: { type: 'module', id: 'later' }, retryAfter: 60 },
            ],
          }),
        [RECHECK]: () => ({ packages: [], pending: [] }),
      });
      const manifests = ['lib', 'dice', 'new', 'fresh', 'later'].map(id => moduleManifest(id, '1.0.0'));

      const found = await lookUpReleases({ core: CORE, manifests }, { kit: KIT, catalogue: CATALOGUE, fetch: send });

      expect(found.catalogue).toMatchObject({
        reached: true,
        pending: ['module:fresh', 'module:later'],
        retryAfter: 60,
        checkedAt: '2026-11-06T09:00:00.000Z',
      });
      await expect(found.catalogue.recheck()).resolves.toBe(true);
      expect(sentBy(send).find(({ url }) => url === RECHECK)?.body).toEqual({
        packages: manifests.map(({ type, id }) => ({ type, id })),
      });
    });

    test('says when it was not reached, and that nothing was ever checked', async () => {
      const send = catalogue({ [LOOKUP]: () => 503, [RECHECK]: () => 503 });

      const found = await lookUpReleases(
        { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
        { kit: KIT, catalogue: CATALOGUE, fetch: send },
      );

      expect(found.catalogue).toMatchObject({ reached: false, pending: [], checkedAt: null });
      expect(found.catalogue).not.toHaveProperty('retryAfter');
      await expect(found.catalogue.recheck()).resolves.toBe(false);
    });

    test('checks nothing without a catalogue, or with nothing installed', async () => {
      const send = catalogue({ [LOOKUP]: () => answer() });
      const none = await lookUpReleases(
        { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
        { kit: KIT, catalogue: null, fetch: send },
      );
      const empty = await lookUpReleases(
        { core: CORE, manifests: [] },
        { kit: KIT, catalogue: CATALOGUE, fetch: send },
      );

      await expect(none.catalogue.recheck()).resolves.toBe(false);
      await expect(empty.catalogue.recheck()).resolves.toBe(false);
      expect(none.catalogue.reached).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
