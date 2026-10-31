import { describe, expect, test } from 'vitest';

import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

const MODULES = [
  installedModule('lib', 'Library', '1.0.0'),
  installedModule('app', 'App', '2.0.0', { requires: ['lib'] }),
  installedModule('idle', 'Idle', '1.0.0', { systems: ['dnd5e'] }),
];

/**
 * Build the overview of one world, `w`, with D&D 5e and the {@link MODULES} installed.
 * @param state - What its folder holds of its record
 * @param change - What else differs in the installation
 * @returns The world's overview
 */
function world(state: RecordState | undefined, change: Parameters<typeof installation>[0] = {}) {
  const overview = buildOverview(
    installation({ worlds: [{ id: 'w', title: 'World', system: 'dnd5e' }], modules: MODULES, ...change }),
    new Map(state === undefined ? [] : [['w', state]]),
  );
  return overview.worlds[0];
}

describe('buildOverview', () => {
  test('a world whose record matches what is installed, with its modules sorted by title', () => {
    const run = [
      { id: 'lib', title: 'Library', version: '1.0.0' },
      { id: 'app', title: 'App', version: '2.0.0' },
    ];

    expect(world(recorded(record('w', { modules: run })))).toEqual({
      world: { id: 'w', title: 'World', system: 'dnd5e' },
      system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      status: 'matches',
      record: record('w', { modules: run }),
      ranSystem: { id: 'dnd5e', title: 'D&D 5e', recorded: '5.3.3', installed: '5.3.3', status: 'same' },
      modules: [
        { id: 'app', title: 'App', recorded: '2.0.0', installed: '2.0.0', status: 'same' },
        { id: 'lib', title: 'Library', recorded: '1.0.0', installed: '1.0.0', status: 'same' },
      ],
      needs: [],
      differences: [],
    });
  });

  test('a world that last ran with other versions, or modules since uninstalled', () => {
    const overview = world(
      recorded(
        record('w', {
          core: '14.360',
          system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.0' },
          modules: [
            { id: 'lib', title: 'Library', version: '0.9.0' },
            { id: 'gone', title: 'Gone', version: '3.0.0' },
          ],
        }),
      ),
    );

    expect(overview?.status).toBe('differs');
    expect(overview?.modules).toEqual([
      { id: 'gone', title: 'Gone', recorded: '3.0.0', status: 'missing' },
      { id: 'lib', title: 'Library', recorded: '0.9.0', installed: '1.0.0', status: 'other' },
    ]);
    expect(overview?.differences).toEqual([
      { kind: 'core', recorded: '14.360', installed: '14.368' },
      { kind: 'system', title: 'D&D 5e', recorded: '5.3.0', installed: '5.3.3' },
      { kind: 'module', title: 'Gone', recorded: '3.0.0' },
      { kind: 'module', title: 'Library', recorded: '0.9.0', installed: '1.0.0' },
    ]);
  });

  test('orders modules of the same title by ID', () => {
    const overview = world(
      recorded(
        record('w', {
          modules: [
            { id: 'b', title: 'Same', version: '1.0.0' },
            { id: 'a', title: 'Same', version: '1.0.0' },
          ],
        }),
      ),
    );

    expect(overview?.modules.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  test('a world whose system is no longer installed', () => {
    const overview = world(recorded(record('w')), { systems: [] });

    expect(overview?.system).toBeUndefined();
    expect(overview?.differences).toEqual([{ kind: 'system', title: 'D&D 5e', recorded: '5.3.3' }]);
  });

  test.each([
    ['no record', { kind: 'none' } as const, 'unrecorded'],
    ['no record read at all', undefined, 'unrecorded'],
    ['a record that cannot be read', { kind: 'unreadable' } as const, 'unreadable'],
  ])('a world with %s has no modules to show', (_label, state, status) => {
    expect(world(state)).toEqual({
      world: { id: 'w', title: 'World', system: 'dnd5e' },
      system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      status,
      modules: [],
      needs: [],
      differences: [],
    });
  });

  test('lists the worlds that run each installed module, and summarises the installation', () => {
    const overview = buildOverview(
      installation({
        worlds: [
          { id: 'a', title: 'A', system: 'dnd5e' },
          { id: 'b', title: 'B', system: 'pf2e' },
          { id: 'c', title: 'C', system: 'dnd5e' },
          { id: 'd', title: 'D', system: 'pf2e' },
          { id: 'e', title: 'E', system: 'swade' },
        ],
        modules: MODULES,
        systems: [
          { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
          { id: 'pf2e', title: 'Pathfinder 2e', version: '7.0.0' },
        ],
      }),
      new Map<string, RecordState>([
        ['a', recorded(record('a', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))],
        ['b', recorded(record('b', { modules: [{ id: 'lib', title: 'Library', version: '0.1.0' }] }))],
        ['c', { kind: 'unreadable' }],
      ]),
    );

    expect(overview.core).toBe('14.368');
    expect(overview.systems.map(({ id }) => id)).toEqual(['dnd5e', 'pf2e']);
    expect(overview.modules).toEqual([
      { module: MODULES[0], worlds: ['a', 'b'], needed: [] },
      { module: MODULES[1], worlds: [], needed: [] },
      { module: MODULES[2], worlds: [], needed: [] },
    ]);
    expect(overview.summary).toEqual({
      worlds: {
        total: 5,
        systems: [
          { id: 'dnd5e', title: 'D&D 5e', count: 2 },
          { id: 'pf2e', title: 'Pathfinder 2e', count: 2 },
          { id: 'swade', title: 'swade', count: 1 },
        ],
        byStatus: { matches: 1, differs: 1, unrecorded: 2, unreadable: 1 },
      },
      modules: { total: 3, used: 1, pending: 0, unused: 2 },
    });
  });

  test('counts the worlds that will need a module when next run among those that run it', () => {
    const overview = buildOverview(
      installation({
        worlds: [
          { id: 'a', title: 'A', system: 'dnd5e' },
          { id: 'b', title: 'B', system: 'dnd5e' },
        ],
        modules: MODULES,
      }),
      new Map<string, RecordState>([
        ['a', recorded(record('a', { modules: [{ id: 'app', title: 'App', version: '1.0.0' }] }))],
        ['b', recorded(record('b', { modules: [{ id: 'idle', title: 'Idle', version: '1.0.0' }] }))],
      ]),
    );

    expect(overview.worlds[0]?.needs).toEqual([{ id: 'lib', title: 'Library', installed: true, by: ['App'] }]);
    expect(overview.modules[0]).toEqual({ module: MODULES[0], worlds: ['a'], needed: ['a'] });
    expect(overview.summary.modules).toEqual({ total: 3, used: 3, pending: 1, unused: 0 });
  });

  test('compares the game system a world last ran with with what is installed', () => {
    expect(world(recorded(record('w', { system: { id: 'dnd5e', title: 'D&D 5e', version: '4.0.0' } })))).toMatchObject({
      ranSystem: { recorded: '4.0.0', installed: '5.3.3', status: 'other' },
      status: 'differs',
    });
    expect(world(recorded(record('w')), { systems: [] })).toMatchObject({
      ranSystem: { recorded: '5.3.3', status: 'missing' },
    });
  });
});
