import type { Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test, vi } from 'vitest';

import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import { findUpdates } from '../../../src/lib/updates';
import { installation, installedModule, record, recorded, release } from '../../mocks/fixtures';

const CORE = { version: '14.368', generation: 14, channel: 'stable' } as const;

/**
 * Search for updates.
 * @param modules - The installed modules, each as `[id, version]`
 * @param records - The worlds' records, by world ID; each world uses D&D 5e
 * @param releases - Every release found, the installed ones among them
 * @param systems - The installed systems, each as `[id, version]`
 * @returns What the search found
 */
async function search(
  modules: readonly (readonly [string, string])[],
  records: Readonly<Record<string, readonly (readonly [string, string])[]>>,
  releases: readonly Release[],
  systems: readonly (readonly [string, string])[] = [['dnd5e', '5.3.3']],
) {
  const overview = buildOverview(
    installation({
      worlds: [...Object.keys(records), 'unrecorded'].map(id => ({ id, title: id, system: 'dnd5e' })),
      modules: modules.map(([id, version]) => installedModule(id, id, version)),
      systems: systems.map(([id, version]) => ({ id, title: id, version })),
    }),
    new Map<string, RecordState>(
      Object.entries(records).map(([world, run]) => [
        world,
        recorded(record(world, { modules: run.map(([id, version]) => ({ id, title: id, version })) })),
      ]),
    ),
  );
  return findUpdates({ overview, universe: { core: [CORE], releases }, load: () => Promise.resolve([]) });
}

const DND = [release('system:dnd5e', '5.3.3')];

describe('findUpdates', () => {
  test("offers each package of a world the newest version the world's setup takes, never an older one", async () => {
    const found = await search(
      [
        ['app', '1.0.0'],
        ['lib', '1.0.0'],
      ],
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
      },
      [
        ...DND,
        release('module:app', '0.9.0'),
        release('module:app', '1.0.0', { requires: { lib: {} } }),
        release('module:app', '2.0.0', { requires: { lib: { minimum: '2.0.0' } } }),
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0'),
        release('module:lib', '2.5.0'),
        // Needs a newer Foundry than is installed.
        release('module:lib', '3.0.0', { core: { minimum: '15' } }),
      ],
    );

    expect(found.unresolved).toEqual([]);
    expect([...found.updates.values()]).toEqual([
      { key: 'module:app', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] },
      { key: 'module:lib', installed: '1.0.0', newest: '2.5.0', versions: ['2.5.0', '2.0.0', '1.0.0'] },
    ]);
  });

  test('offers a package the newest version every world that uses it accepts', async () => {
    const found = await search(
      [
        ['lib', '1.0.0'],
        ['old', '1.0.0'],
      ],
      {
        a: [['lib', '1.0.0']],
        b: [
          ['lib', '1.0.0'],
          ['old', '1.0.0'],
        ],
      },
      [
        ...DND,
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0'),
        release('module:lib', '3.0.0'),
        // World b's module only works with the library before 3.
        release('module:old', '1.0.0', { requires: { lib: { maximum: '2.0.0' } } }),
      ],
    );

    expect(found.updates.get('module:lib')).toMatchObject({ newest: '2.0.0', versions: ['2.0.0', '1.0.0'] });
    expect(found.updates.has('module:old')).toBe(false);
  });

  test("updates a world's game system as far as its modules allow", async () => {
    const found = await search([['app', '1.0.0']], { a: [['app', '1.0.0']] }, [
      ...DND,
      release('system:dnd5e', '5.4.0'),
      release('system:dnd5e', '6.0.0'),
      release('module:app', '1.0.0', { systems: { dnd5e: { maximum: '5.4.0' } } }),
    ]);

    expect(found.updates.get('system:dnd5e')).toEqual({
      key: 'system:dnd5e',
      installed: '5.3.3',
      newest: '5.4.0',
      versions: ['5.4.0', '5.3.3'],
    });
  });

  test('offers nothing a world uses when no setup is found for it', async () => {
    const found = await search([['app', '1.0.0']], { a: [['app', '1.0.0']] }, [
      ...DND,
      release('module:app', '1.0.0', { requires: { gone: {} } }),
      release('module:app', '2.0.0', { requires: { gone: {} } }),
    ]);

    expect(found.unresolved).toEqual(['a']);
    expect(found.updates.size).toBe(0);
  });

  test('offers a package no recorded world uses its newest version the installed Foundry can run', async () => {
    const found = await search([['idle', '1.0.0']], {}, [
      ...DND,
      release('system:dnd5e', '5.5.0'),
      release('module:idle', '1.0.0'),
      release('module:idle', '1.1.0'),
      release('module:idle', '1.2.0-beta.1'),
      release('module:idle', '1.3.0', { unlisted: true }),
      release('module:idle', '1.4.0', { core: {} }),
      release('module:idle', '2.0.0', { core: { minimum: '15' } }),
    ]);

    expect(found.updates.get('module:idle')).toMatchObject({ newest: '1.1.0', versions: ['1.1.0', '1.0.0'] });
    expect(found.updates.get('system:dnd5e')).toMatchObject({ newest: '5.5.0' });
  });

  test('loads the releases the resolver needs, and keeps them for the next world', async () => {
    const listed = { ...release('module:app', '2.0.0'), detail: 'listed' as const };
    const load = vi.fn(() => Promise.resolve([release('module:app', '2.0.0')]));
    const overview = buildOverview(
      installation({
        worlds: [
          { id: 'a', title: 'A', system: 'dnd5e' },
          { id: 'b', title: 'B', system: 'dnd5e' },
        ],
        modules: [installedModule('app', 'App', '1.0.0')],
      }),
      new Map(
        ['a', 'b'].map(id => [id, recorded(record(id, { modules: [{ id: 'app', title: 'App', version: '1.0.0' }] }))]),
      ),
    );

    const found = await findUpdates({
      overview,
      universe: { core: [CORE], releases: [...DND, release('module:app', '1.0.0'), listed] },
      load,
    });

    expect(found.updates.get('module:app')).toMatchObject({ newest: '2.0.0' });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
