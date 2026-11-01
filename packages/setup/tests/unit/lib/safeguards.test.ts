import { describe, expect, test } from 'vitest';

import { buildOverview } from '../../../src/lib/overview';
import type { PlanEntry } from '../../../src/lib/plans';
import type { SafeguardEdit } from '../../../src/lib/safeguards';
import { SNAPSHOT, backupKey, safeguardsFor } from '../../../src/lib/safeguards';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

/**
 * Three worlds: Alpha runs Midi and Library, Beta runs Library and will need Midi when next run, and Gamma, without a
 * record, uses Pathfinder.
 */
const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'alpha', title: 'Alpha', system: 'dnd5e' },
      { id: 'beta', title: 'Beta', system: 'dnd5e' },
      { id: 'gamma', title: 'Gamma', system: 'pf2e' },
    ],
    modules: [
      installedModule('midi', 'Midi', '1.0.0'),
      installedModule('lib', 'Library', '1.0.0', { requires: ['midi'] }),
    ],
    systems: [
      { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
    ],
  }),
  new Map([
    [
      'alpha',
      recorded(
        record('alpha', {
          modules: [
            { id: 'midi', title: 'Midi', version: '1.0.0' },
            { id: 'lib', title: 'Library', version: '1.0.0' },
          ],
        }),
      ),
    ],
    ['beta', recorded(record('beta', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))],
  ]),
);

const NOTES = { snapshot: 'Before the plan', backup: (packages: readonly string[]) => `Before ${packages.join(', ')}` };
const TITLES: Readonly<Record<string, string>> = {
  core: 'Foundry VTT',
  'system:dnd5e': 'D&D 5e',
  'system:pf2e': 'Pathfinder',
  'module:midi': 'Midi',
  'module:lib': 'Library',
};

/**
 * A change in a plan.
 * @param key - The package
 * @returns The change
 */
const change = (key: string): PlanEntry => ({ key, installed: '1.0.0', version: '2.0.0' });

/**
 * The safeguards a plan offers.
 * @param keys - The packages it changes
 * @param edits - What the user changed
 * @returns The safeguards
 */
const offered = (keys: readonly string[], edits: ReadonlyMap<string, SafeguardEdit> = new Map()) =>
  safeguardsFor(OVERVIEW, keys.map(change), edits, NOTES, key => TITLES[key] ?? key);

describe('safeguardsFor', () => {
  test('offers nothing for an empty plan', () => {
    expect(offered([])).toEqual([]);
  });

  test('offers the snapshot first, unchecked, then a backup of each world that uses a package the plan changes', () => {
    expect(offered(['module:lib'])).toEqual([
      { key: SNAPSHOT, kind: 'snapshot', checked: false, recommended: false, note: 'Before the plan' },
      {
        key: backupKey('alpha'),
        kind: 'backup',
        world: { id: 'alpha', title: 'Alpha' },
        packages: ['Library'],
        checked: false,
        recommended: false,
        note: 'Before Library',
      },
      {
        key: backupKey('beta'),
        kind: 'backup',
        world: { id: 'beta', title: 'Beta' },
        packages: ['Library'],
        checked: false,
        recommended: false,
        note: 'Before Library',
      },
    ]);
  });

  test('backs up a world for its system, and for a module it will need when next run', () => {
    // Beta's record does not run Midi, but the Library it runs requires it, so Beta will need it when next run.
    expect(OVERVIEW.worlds.find(({ world }) => world.id === 'beta')?.needs.map(({ id }) => id)).toEqual(['midi']);
    expect(offered(['system:pf2e', 'module:midi']).map(({ key, packages }) => [key, packages])).toEqual([
      [SNAPSHOT, undefined],
      [backupKey('alpha'), ['Midi']],
      [backupKey('beta'), ['Midi']],
      [backupKey('gamma'), ['Pathfinder']],
    ]);
    // A world names each package once: its system first, then its modules, as its record lists them.
    expect(offered(['module:lib', 'system:dnd5e', 'module:midi'])[1]?.packages).toEqual(['D&D 5e', 'Library', 'Midi']);
  });

  test('checks the snapshot, as a recommendation, when the plan changes Foundry VTT', () => {
    expect(offered(['core'])).toEqual([
      { key: SNAPSHOT, kind: 'snapshot', checked: true, recommended: true, note: 'Before the plan' },
    ]);
  });

  test('keeps what the user changed', () => {
    const edits = new Map<string, SafeguardEdit>([
      [SNAPSHOT, { checked: false }],
      [backupKey('alpha'), { checked: true, note: 'My note' }],
    ]);

    const [snapshot, alpha] = offered(['core', 'module:midi'], edits);

    expect(snapshot).toMatchObject({ checked: false, recommended: true, note: 'Before the plan' });
    expect(alpha).toMatchObject({ checked: true, note: 'My note' });
  });
});
