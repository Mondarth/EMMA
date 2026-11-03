import type { Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test, vi } from 'vitest';

import type { Installation } from '../../../src/foundry/setup-game';
import { buildOverview, isIgnored } from '../../../src/lib/overview';
import { findUpdates } from '../../../src/lib/updates';
import { installation, installedModule, record, recorded, release } from '../../mocks/fixtures';
import { KIT } from '../../mocks/kit';

const CORES = [{ version: '14.368', generation: 14, channel: 'stable' }] as const;

/**
 * Two D&D 5e worlds: Alpha runs App 1.0.0 and Library 1.0.0; Beta runs Old 1.0.0.
 * @param ignored - What EMMA ignores
 * @param change - What else is installed differently
 * @returns The installation
 */
function overviewOf(ignored: readonly string[], change: Partial<Installation> = {}) {
  return buildOverview(
    installation({
      worlds: [
        { id: 'a', title: 'Alpha', system: 'dnd5e' },
        { id: 'b', title: 'Beta', system: 'dnd5e' },
      ],
      modules: [
        installedModule('app', 'App', '1.0.0'),
        installedModule('lib', 'Library', '1.0.0'),
        installedModule('old', 'Old', '1.0.0'),
      ],
      ignored,
      ...change,
    }),
    new Map([
      [
        'a',
        recorded(
          record('a', {
            modules: [
              { id: 'app', title: 'App', version: '1.0.0' },
              { id: 'lib', title: 'Library', version: '1.0.0' },
            ],
          }),
        ),
      ],
      ['b', recorded(record('b', { modules: [{ id: 'old', title: 'Old', version: '1.0.0' }] }))],
    ]),
  );
}

/**
 * D&D 5e 5.3.3 and 6.0.6, which Old 1.0.0 does not run in; App 2.0.0, which requires a Library 3 never released, and
 * runs in D&D 5e 7 or later alone, which is never released either; Library 2.0.0.
 */
const RELEASES: Release[] = [
  release('system:dnd5e', '5.3.3'),
  release('system:dnd5e', '6.0.6'),
  release('module:app', '1.0.0', { requires: { lib: {} } }),
  release('module:app', '2.0.0', {
    requires: { lib: { minimum: '3.0.0' } },
    systems: { dnd5e: { minimum: '7.0.0' } },
  }),
  release('module:lib', '1.0.0'),
  release('module:lib', '2.0.0'),
  release('module:old', '1.0.0', { systems: { dnd5e: { maximum: '5.9.99' } } }),
];

/**
 * Search for updates.
 * @param ignored - What EMMA ignores
 * @param more - What else the search is given
 * @returns What it found
 */
function search(ignored: readonly string[], more: Partial<Parameters<typeof findUpdates>[0]> = {}) {
  return findUpdates({
    resolver: KIT.resolver,
    badges: KIT.badges,
    overview: overviewOf(ignored),
    universe: { core: [...CORES], releases: RELEASES },
    load: () => Promise.resolve([]),
    ...more,
  });
}

describe('what EMMA ignores', () => {
  test('is only what is still installed', () => {
    const overview = overviewOf(['world:b', 'module:gone', 'system:dnd5e', 'world:gone']);

    expect(overview.ignored).toEqual(['world:b', 'system:dnd5e']);
    expect(isIgnored(overview, 'world:b')).toBe(true);
    expect(isIgnored(overview, 'module:gone')).toBe(false);
    expect(overviewOf(['module:gone']).ignored).toBeUndefined();
    expect(isIgnored(overviewOf([]), 'world:b')).toBe(false);
  });

  test('holds nothing back for a world: its setup is not taken into account', async () => {
    const found = await search([]);
    // Old, in Beta, runs in D&D 5e 5 alone.
    expect(found.updates.get('system:dnd5e')).toBeUndefined();

    const ignoring = await search(['world:b']);
    expect(ignoring.updates.get('system:dnd5e')?.newest).toBe('6.0.6');
  });

  test('never updates a module, and takes it as whatever version of it another asks', async () => {
    const found = await search(['module:lib', 'system:dnd5e']);

    expect(found.updates.get('module:lib')).toBeUndefined();
    expect(found.blocked.get('module:lib')).toBeUndefined();
    expect(found.updates.get('system:dnd5e')).toBeUndefined();
    // App 2.0.0 asks a Library 3 and a D&D 5e 7 that do not exist; they are taken as the ones installed.
    expect(found.updates.get('module:app')?.newest).toBe('2.0.0');
  });

  test('leaves releases loaded or looked up later as it leaves those found first', async () => {
    const listed = release('module:lib', '5.0.0');
    const lookUp = vi.fn(() =>
      Promise.resolve([
        release('module:dice', '1.0.0', { requires: { lib: { minimum: '4.0.0' } } }),
        release('module:lib', '4.0.0'),
      ]),
    );
    const found = await search(['module:lib'], {
      lookUp,
    });
    expect(found.updates.get('module:lib')).toBeUndefined();

    await found.planner.add('module:dice');

    expect(lookUp).toHaveBeenCalled();
    expect(found.planner.candidates('module:lib')).toEqual([]);
    await expect(found.planner.complete(new Map([['module:dice', '1.0.0']]))).resolves.toMatchObject({ ok: true });

    // Loaded, a release of it is left out too, and what another asks of it is taken as the one installed.
    const loading = await search(['module:lib'], {
      universe: { core: [...CORES], releases: [...RELEASES, { ...release('module:app', '3.0.0'), detail: 'listed' }] },
      load: () =>
        Promise.resolve([release('module:app', '3.0.0', { requires: { lib: { minimum: '5.0.0' } } }), listed]),
    });
    expect(loading.updates.get('module:lib')).toBeUndefined();
    expect(loading.updates.get('module:app')?.newest).toBe('3.0.0');
  });
});
