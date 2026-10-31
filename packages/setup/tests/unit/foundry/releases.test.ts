import { describe, expect, test, vi } from 'vitest';

import { lookUpReleases } from '../../../src/foundry/releases';
import type { InstalledManifests, PackageManifest } from '../../../src/foundry/setup-game';

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
 * A fetch that answers some URLs with JSON, and every other with a 404.
 * @param answers - The JSON for each URL
 * @returns The fetch, a spy
 */
function answering(answers: Readonly<Record<string, unknown>>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = answers[url];
    return Promise.resolve(
      body === undefined
        ? new Response('Not found', { status: 404 })
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

    const found = await lookUpReleases(installed, { catalogue: null, fetch: send });

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
      { catalogue: null, fetch: send },
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
      { catalogue: { url: 'https://catalogue.example.test/', key: 'k3y' }, fetch: send },
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
      { catalogue: { url: 'https://catalogue.example.test/', key: 'k3y' }, fetch: send },
    );

    expect(found.universe.releases.map(({ package: { id }, version }) => `${id}@${version}`).sort()).toEqual([
      'gone@1.0.0',
      'lib@1.0.0',
      'lib@2.0.0',
    ]);
    expect([...found.unavailable]).toEqual(['module:gone']);
  });
});
