import { describe, expect, test } from 'vitest';

import { buildOverview } from '../../../src/lib/overview';
import { blockText, uninstallEffects, warningText } from '../../../src/lib/uninstall';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

/**
 * Alpha runs Midi; Beta runs Library, and will need Midi when next run, as Library requires it; Gamma, without a record,
 * uses Pathfinder. Tools is for D&D 5e alone, Map for Pathfinder or D&D 5e, Grid for any system, and Old, locked, for
 * D&D 5e.
 */
const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'alpha', title: 'Alpha', system: 'dnd5e' },
      { id: 'beta', title: 'Beta', system: 'dnd5e' },
      { id: 'gamma', title: 'Gamma', system: 'pf2e' },
    ],
    modules: [
      installedModule('midi', 'Midi', '1.0.0', { systems: ['dnd5e'] }),
      installedModule('lib', 'Library', '1.0.0', { requires: ['midi'] }),
      installedModule('tools', 'Tools', '1.0.0', { systems: ['sw5e'] }),
      installedModule('map', 'Map', '1.0.0', { systems: ['sw5e', 'pf2e'] }),
      installedModule('grid', 'Grid', '1.0.0'),
      { ...installedModule('old', 'Old', '1.0.0', { systems: ['dnd5e'] }), locked: true },
    ],
    systems: [
      { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
      { id: 'sw5e', title: 'SW 5e', version: '2.0.0', locked: true },
    ],
  }),
  new Map([
    ['alpha', recorded(record('alpha', { modules: [{ id: 'midi', title: 'Midi', version: '1.0.0' }] }))],
    ['beta', recorded(record('beta', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))],
  ]),
);

describe('uninstallEffects', () => {
  test('refuses to uninstall a game system a world uses', () => {
    expect(uninstallEffects(OVERVIEW, 'system:dnd5e', [])).toEqual({
      blocks: [
        { kind: 'world-system', world: 'Alpha' },
        { kind: 'world-system', world: 'Beta' },
      ],
      warnings: [
        { kind: 'orphaned', module: 'Midi' },
        { kind: 'orphaned', module: 'Old' },
      ],
    });
  });

  test("warns of the modules a game system's uninstall leaves with no system they run in", () => {
    // Map still runs in Pathfinder, unless that goes too.
    expect(uninstallEffects(OVERVIEW, 'system:sw5e', [])).toEqual({
      blocks: [{ kind: 'locked' }],
      warnings: [{ kind: 'orphaned', module: 'Tools' }],
    });
    expect(uninstallEffects(OVERVIEW, 'system:sw5e', ['system:pf2e']).warnings).toEqual([
      { kind: 'orphaned', module: 'Tools' },
      { kind: 'orphaned', module: 'Map' },
    ]);
    // A module the plan uninstalls too is not left.
    expect(uninstallEffects(OVERVIEW, 'system:sw5e', ['module:tools']).warnings).toEqual([]);
  });

  test('refuses to uninstall a module a recorded world runs, or will need, or another requires', () => {
    expect(uninstallEffects(OVERVIEW, 'module:midi', [])).toEqual({
      blocks: [
        { kind: 'world-module', world: 'Alpha', needed: false },
        { kind: 'world-module', world: 'Beta', needed: true },
        { kind: 'required', by: 'Library' },
      ],
      warnings: [],
    });
  });

  test('does not count a module that requires it if the plan uninstalls that too', () => {
    const { blocks } = uninstallEffects(OVERVIEW, 'module:midi', ['module:lib']);

    expect(blocks).not.toContainEqual({ kind: 'required', by: 'Library' });
  });

  test('warns that a world without a record may run a module for its system, and refuses a locked one', () => {
    expect(uninstallEffects(OVERVIEW, 'module:grid', [])).toEqual({
      blocks: [],
      warnings: [{ kind: 'unrecorded', world: 'Gamma' }],
    });
    expect(uninstallEffects(OVERVIEW, 'module:map', []).warnings).toEqual([{ kind: 'unrecorded', world: 'Gamma' }]);
    expect(uninstallEffects(OVERVIEW, 'module:tools', [])).toEqual({ blocks: [], warnings: [] });
    expect(uninstallEffects(OVERVIEW, 'module:old', []).blocks).toEqual([{ kind: 'locked' }]);
  });

  test('finds nothing for a package not installed', () => {
    expect(uninstallEffects(OVERVIEW, 'module:none', [])).toEqual({ blocks: [], warnings: [] });
    expect(uninstallEffects(OVERVIEW, 'system:none', [])).toEqual({ blocks: [], warnings: [] });
  });
});

describe('in words', () => {
  test('says why an uninstall is refused', () => {
    expect(
      [
        { kind: 'locked' } as const,
        { kind: 'world-system', world: 'Alpha' } as const,
        { kind: 'world-module', world: 'Alpha', needed: false } as const,
        { kind: 'world-module', world: 'Beta', needed: true } as const,
        { kind: 'required', by: 'Library' } as const,
      ].map(blockText),
    ).toEqual([
      'It is locked in Foundry.',
      'Alpha uses it as its game system.',
      'Alpha runs it.',
      'Beta will need it when next run.',
      'Library requires it.',
    ]);
  });

  test('says what it may break', () => {
    expect(warningText({ kind: 'unrecorded', world: 'Gamma' })).toBe('Gamma has no record, so it may run it.');
    expect(warningText({ kind: 'orphaned', module: 'Tools' })).toBe('Tools is left with no game system it runs in.');
  });
});
