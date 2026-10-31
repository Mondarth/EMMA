import { describe, expect, test, vi } from 'vitest';

import { lookUpReleases } from '../../../src/foundry/releases';
import type { InstalledManifests, PackageManifest } from '../../../src/foundry/setup-game';
import { KIT } from '../../mocks/kit';

const CORE = { version: '14.368', generation: 14, channel: 'stable' };

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
 * A fetch that answers some URLs with JSON, or with text for a string, and every other with a 404.
 * @param answers - The JSON or the text for each URL
 * @returns The fetch, a spy
 */
function answering(answers: Readonly<Record<string, unknown>>) {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = answers[url];
    return Promise.resolve(
      body === undefined
        ? new Response('Not found', { status: 404 })
        : typeof body === 'string'
          ? new Response(body, { headers: { 'Content-Type': 'text/html' } })
          : new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
    );
  });
}

describe('lookUpReleases', () => {
  test('finds the installed releases, and newer ones from a manifest URL the browser may read', async () => {
    const url = 'https://packages.example.test/app/module.json';
    const installed: InstalledManifests = { core: CORE, manifests: [moduleManifest('app', '1.0.0', url)] };
    const send = answering({
      [url]: { id: 'app', title: 'App', version: '2.0.0', compatibility: { minimum: '14', verified: '14' } },
    });

    const found = await lookUpReleases(installed, { kit: KIT, catalogue: null, proxy: null, fetch: send });

    expect(found.universe.core).toEqual([{ version: '14.368', generation: 14, channel: 'stable' }]);
    expect(found.universe.releases.map(({ version }) => version).sort()).toEqual(['1.0.0', '2.0.0']);
    expect(found.unavailable.size).toBe(0);
    await expect(found.load([])).resolves.toEqual([]);
  });

  test('never asks a site that sends no CORS headers', async () => {
    const url = 'https://github.com/someone/lib/releases/latest/download/module.json';
    const send = answering({});

    const found = await lookUpReleases(
      { core: { ...CORE, channel: 'unheard-of' }, manifests: [moduleManifest('lib', '1.0.0', url)] },
      { kit: KIT, catalogue: null, proxy: null, fetch: send },
    );

    expect(send.mock.calls.map(([input]) => (input instanceof Request ? input.url : input.toString()))).not.toContain(
      url,
    );
    expect(found.universe.core[0]?.channel).toBe('stable');
    expect(found.universe.releases.map(({ version }) => version)).toEqual(['1.0.0']);
  });

  test('asks the catalogue first, and keeps the installed releases when it fails', async () => {
    const send = answering({});

    const found = await lookUpReleases(
      { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
      { kit: KIT, catalogue: { url: 'https://catalogue.example.test/', key: 'k3y' }, proxy: null, fetch: send },
    );

    expect(
      send.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : input.toString()).startsWith('https://catalogue.example.test/'),
      ),
    ).toBe(true);
    expect(found.universe.releases.map(({ version }) => version)).toEqual(['1.0.0']);
  });

  test("takes what the catalogue holds, adding the installed releases it does not give, and what it says can't be had", async () => {
    const lib = {
      package: { type: 'module', id: 'lib' },
      version: '2.0.0',
      compatibility: { minimum: '14', verified: '14' },
      relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
      protected: false,
      origin: 'https://packages.example.test/lib/module.json',
      detail: 'loaded',
    };
    const send = answering({
      'https://catalogue.example.test/api/v1/universe': {
        universe: { core: [], releases: [lib] },
        gaps: [],
        pending: [],
        unavailable: [{ package: { type: 'module', id: 'gone' }, reason: 'archived' }],
        asOf: null,
      },
    });

    const found = await lookUpReleases(
      {
        core: CORE,
        manifests: [
          moduleManifest('lib', '1.0.0'),
          moduleManifest('gone', '1.0.0'),
          // A manifest Foundry gave that cannot be read gives nothing.
          { ...moduleManifest('broken', '1.0.0'), json: null },
        ],
      },
      { kit: KIT, catalogue: { url: 'https://catalogue.example.test/', key: 'k3y' }, proxy: null, fetch: send },
    );

    expect(found.universe.releases.map(({ package: { id }, version }) => `${id}@${version}`).sort()).toEqual([
      'gone@1.0.0',
      'lib@1.0.0',
      'lib@2.0.0',
    ]);
    expect([...found.unavailable]).toEqual(['module:gone']);
  });

  test('fetches through the proxy, with its key and the version, but asks the catalogue directly', async () => {
    const url = 'https://github.com/someone/lib/releases/latest/download/module.json';
    const proxied = (target: string) => `https://proxy.example.test/?url=${encodeURIComponent(target)}`;
    const send = answering({
      [proxied(url)]: { id: 'lib', title: 'Lib', version: '2.0.0', compatibility: { minimum: '14', verified: '14' } },
    });

    const found = await lookUpReleases(
      { core: CORE, manifests: [moduleManifest('lib', '1.0.0', url)] },
      {
        kit: KIT,
        catalogue: { url: 'https://catalogue.example.test/', key: 'catalogue-k3y' },
        proxy: { url: 'https://proxy.example.test/?url={url}', key: 'proxy-k3y' },
        clientVersion: '0.2.0',
        fetch: send,
      },
    );

    expect(found.universe.releases.map(({ version }) => version).sort()).toEqual(['1.0.0', '2.0.0']);
    const requests = send.mock.calls.map(([input, init]) => ({
      url: input instanceof Request ? input.url : input.toString(),
      headers: new Headers(init?.headers),
    }));
    const toProxy = requests.filter(({ url: sent }) => sent.startsWith('https://proxy.example.test/'));
    const toCatalogue = requests.filter(({ url: sent }) => sent.startsWith('https://catalogue.example.test/'));
    expect(toProxy.map(({ url: sent }) => sent)).toContain(proxied(url));
    expect(toProxy.length + toCatalogue.length).toBe(requests.length);
    for (const { headers } of toProxy) {
      expect(headers.get('X-API-Key')).toBe('proxy-k3y');
      expect(headers.get('X-EMMA-Version')).toBe('extension-0.2.0');
    }
    expect(toCatalogue).not.toHaveLength(0);
    for (const { headers } of toCatalogue) {
      expect(headers.get('X-API-Key')).toBe('catalogue-k3y');
      expect(headers.get('X-Catalogue-Client')).toBe('EMMA-extension/0.2.0');
    }
  });

  test('names no version to the proxy without one', async () => {
    const send = answering({});

    await lookUpReleases(
      { core: CORE, manifests: [moduleManifest('lib', '1.0.0', 'https://packages.example.test/lib/module.json')] },
      {
        kit: KIT,
        catalogue: null,
        proxy: { url: 'https://proxy.example.test/?url={url}', key: 'proxy-k3y' },
        fetch: send,
      },
    );

    expect(send).toHaveBeenCalled();
    for (const [, init] of send.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-API-Key')).toBe('proxy-k3y');
      expect(headers.has('X-EMMA-Version')).toBe(false);
    }
  });

  describe("Foundry's builds", () => {
    const PROXY = { url: 'https://proxy.example.test/?url={url}', key: 'proxy-k3y' };
    const proxied = (target: string) => `https://proxy.example.test/?url=${encodeURIComponent(target)}`;
    const NOTES = 'https://foundryvtt.com/releases/';
    const PAGE = [
      '<a href="/releases/14.370">Release 14.370</a><span class="release-tag testing">',
      '<a href="/releases/14.369">Release 14.369</a><span class="release-tag stable">',
      '<a href="/releases/14.368">Release 14.368</a><span class="release-tag stable">',
    ].join('');

    test('are read from the release notes through the proxy, keeping a release only a newer one runs', async () => {
      const url = 'https://packages.example.test/lib/module.json';
      const send = answering({
        [proxied(NOTES)]: PAGE,
        [proxied(url)]: { id: 'lib', title: 'Lib', version: '2.0.0', compatibility: { minimum: '14.369' } },
      });

      // A kit of its own, so that no other test's builds are kept for it.
      const found = await lookUpReleases(
        { core: CORE, manifests: [moduleManifest('lib', '1.0.0', url)] },
        { kit: { ...KIT }, catalogue: null, proxy: PROXY, fetch: send },
      );

      expect(found.universe.core).toEqual([
        CORE,
        { version: '14.370', generation: 14, channel: 'testing' },
        { version: '14.369', generation: 14, channel: 'stable' },
      ]);
      expect(found.universe.releases.map(({ version }) => version).sort()).toEqual(['1.0.0', '2.0.0']);
      expect(found.unreached).not.toContain('core');
    });

    test('are the installed one alone when the release notes cannot be read, saying so', async () => {
      const found = await lookUpReleases(
        { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
        { kit: { ...KIT }, catalogue: null, proxy: PROXY, fetch: answering({}) },
      );

      expect(found.universe.core).toEqual([CORE]);
      expect(found.unreached).toContain('core');
    });

    test('are not asked for without the proxy', async () => {
      const send = answering({});

      const found = await lookUpReleases(
        { core: CORE, manifests: [moduleManifest('lib', '1.0.0')] },
        { kit: { ...KIT }, catalogue: null, proxy: null, fetch: send },
      );

      expect(found.universe.core).toEqual([CORE]);
      expect(found.unreached).toEqual([]);
      expect(send.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input))).not.toContain(
        NOTES,
      );
    });
  });
});
