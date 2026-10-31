import { describe, expect, test } from 'vitest';

import { buildOverview } from '../../../src/lib/overview';
import type { TreeRow } from '../../../src/lib/tree';
import { INITIALLY_EXPANDED, MODULES, moveFor, ROOT, SYSTEMS, visibleRows } from '../../../src/lib/tree';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

/**
 * Two D&D 5e worlds and a Pathfinder world, whose system is not installed; a library for any system, a module for
 * D&D 5e that requires it, one for D&D 5e and Pathfinder, and one that requires a module that is not installed and
 * one that requires it back.
 */
const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'a', title: 'A', system: 'dnd5e' },
      { id: 'b', title: 'B', system: 'dnd5e' },
      { id: 'p', title: 'P', system: 'pf2e' },
    ],
    modules: [
      installedModule('lib', 'Library', '1.0.0'),
      installedModule('app', 'App', '2.0.0', { systems: ['dnd5e'], requires: ['lib'] }),
      installedModule('both', 'Both', '3.0.0', { systems: ['pf2e', 'dnd5e'] }),
      installedModule('loop', 'Loop', '1.0.0', { requires: ['gone', 'back'] }),
      installedModule('back', 'Back', '1.0.0', { requires: ['loop'] }),
    ],
  }),
  new Map([
    [
      'a',
      recorded(
        record('a', {
          modules: [
            { id: 'app', title: 'App', version: '2.0.0' },
            { id: 'old', title: 'Old', version: '0.1.0' },
          ],
        }),
      ),
    ],
  ]),
);

/**
 * The keys of rows.
 * @param rows - The rows
 * @returns Their keys
 */
const keys = (rows: readonly TreeRow[]) => rows.map(({ key }) => key);

/**
 * The row with a key.
 * @param rows - The rows
 * @param key - The key
 * @returns The row
 */
const rowOf = (rows: readonly TreeRow[], key: string) => rows.find(row => row.key === key);

const DND = `${SYSTEMS}/system:dnd5e`;
const WORLD_A = `${DND}/world:a`;

describe('visibleRows', () => {
  test('shows only the root while it is collapsed', () => {
    expect(visibleRows(OVERVIEW, new Set())).toEqual([
      { key: ROOT, level: 1, selection: { kind: 'root' }, title: 'Foundry VTT 14.368', expandable: true },
    ]);
  });

  test('shows the game systems and the modules under the root at first, each in groups', () => {
    const rows = visibleRows(OVERVIEW, new Set(INITIALLY_EXPANDED));

    expect(keys(rows)).toEqual([
      ROOT,
      SYSTEMS,
      DND,
      `${SYSTEMS}/system:pf2e`,
      MODULES,
      `${MODULES}/universal`,
      `${MODULES}/system:dnd5e`,
      `${MODULES}/system:pf2e`,
    ]);
    expect(rows[1]).toEqual({
      key: SYSTEMS,
      level: 2,
      selection: { kind: 'systems' },
      title: 'Game systems',
      expandable: true,
      parent: ROOT,
    });
    expect(rows[2]).toMatchObject({ level: 3, title: 'D&D 5e', version: '5.3.3', expandable: true });
    expect(rows[3]).toMatchObject({ title: 'pf2e', status: { kind: 'package', value: 'missing' } });
    expect(rows[5]).toMatchObject({ selection: { kind: 'group' }, title: 'Universal', expandable: true });
    expect(rows[6]).toMatchObject({ selection: { kind: 'group', system: 'dnd5e' }, title: 'D&D 5e' });
    expect(rows[6]).not.toHaveProperty('status');
    expect(rows[7]).toMatchObject({ title: 'pf2e', status: { kind: 'package', value: 'missing' } });
  });

  test('shows the worlds under their game system, and under each world what its record says it last ran with', () => {
    const rows = visibleRows(OVERVIEW, new Set([ROOT, SYSTEMS, DND, WORLD_A]));

    expect(keys(rows).slice(2, 8)).toEqual([
      DND,
      WORLD_A,
      `${WORLD_A}/system:dnd5e`,
      `${WORLD_A}/module:app`,
      `${WORLD_A}/module:old`,
      `${DND}/world:b`,
    ]);
    expect(rowOf(rows, DND)).toMatchObject({ version: '5.3.3', status: { kind: 'package', value: 'same' } });
    expect(rowOf(rows, `${WORLD_A}/system:dnd5e`)).toEqual({
      key: `${WORLD_A}/system:dnd5e`,
      level: 5,
      selection: { kind: 'system', system: 'dnd5e', world: 'a' },
      title: 'D&D 5e',
      version: '5.3.3',
      status: { kind: 'package', value: 'same' },
      expandable: false,
      parent: WORLD_A,
    });
    expect(rowOf(rows, WORLD_A)).toMatchObject({ status: { kind: 'world', value: 'differs' }, expandable: true });
    expect(rowOf(rows, `${DND}/world:b`)).toMatchObject({
      status: { kind: 'world', value: 'unrecorded' },
      expandable: false,
    });
    expect(rowOf(rows, `${WORLD_A}/module:app`)).toEqual({
      key: `${WORLD_A}/module:app`,
      level: 5,
      selection: { kind: 'module', module: 'app', world: 'a' },
      title: 'App',
      version: '2.0.0',
      status: { kind: 'package', value: 'same' },
      expandable: true,
      parent: WORLD_A,
    });
    // Only the manifest of an installed module says what it requires.
    expect(rowOf(rows, `${WORLD_A}/module:old`)).toMatchObject({
      status: { kind: 'package', value: 'missing' },
      expandable: false,
    });
  });

  test("shows a module's requirements under it, in the world it is under", () => {
    const app = `${WORLD_A}/module:app`;
    const rows = visibleRows(OVERVIEW, new Set([ROOT, SYSTEMS, DND, WORLD_A, app]));

    expect(rowOf(rows, `${app}/module:lib`)).toEqual({
      key: `${app}/module:lib`,
      level: 6,
      selection: { kind: 'module', module: 'lib', world: 'a' },
      title: 'Library',
      version: '1.0.0',
      installed: true,
      expandable: false,
      parent: app,
    });
  });

  test('shows a module in each group it belongs to', () => {
    const groups = [`${MODULES}/universal`, `${MODULES}/system:dnd5e`, `${MODULES}/system:pf2e`];
    const rows = visibleRows(OVERVIEW, new Set([ROOT, MODULES, ...groups]));

    expect(keys(rows).filter(key => key.startsWith(MODULES))).toEqual([
      MODULES,
      groups[0],
      // In the installation's order, which readInstallation sorts by title.
      `${groups[0]}/module:lib`,
      `${groups[0]}/module:loop`,
      `${groups[0]}/module:back`,
      groups[1],
      `${groups[1]}/module:app`,
      `${groups[1]}/module:both`,
      groups[2],
      `${groups[2]}/module:both`,
    ]);
    expect(rowOf(rows, `${groups[1]}/module:app`)).toMatchObject({
      selection: { kind: 'module', module: 'app' },
      version: '2.0.0',
      expandable: true,
    });
    expect(rowOf(rows, `${groups[1]}/module:app`)).not.toHaveProperty('status');
  });

  test('shows the requirements by title, those not installed too, and never a module again under itself', () => {
    const loop = `${MODULES}/universal/module:loop`;
    const rows = visibleRows(OVERVIEW, new Set([ROOT, MODULES, `${MODULES}/universal`, loop, `${loop}/module:back`]));

    expect(keys(rows).filter(key => key.startsWith(loop))).toEqual([
      loop,
      `${loop}/module:back`,
      `${loop}/module:gone`,
    ]);
    expect(rowOf(rows, `${loop}/module:back`)).toMatchObject({ expandable: false });
    expect(rowOf(rows, `${loop}/module:gone`)).toMatchObject({
      title: 'gone',
      status: { kind: 'package', value: 'missing' },
      expandable: false,
    });
  });

  test('leaves out the universal group without modules for any system', () => {
    const overview = buildOverview(
      installation({ modules: [installedModule('app', 'App', '1.0.0', { systems: ['dnd5e'] })] }),
      new Map(),
    );

    expect(keys(visibleRows(overview, new Set([ROOT, MODULES]))).slice(-2)).toEqual([
      MODULES,
      `${MODULES}/system:dnd5e`,
    ]);
  });
});

describe('moveFor', () => {
  const expanded = new Set([ROOT, SYSTEMS]);
  const rows = visibleRows(OVERVIEW, expanded);
  const PF2E = `${SYSTEMS}/system:pf2e`;

  test.each([
    ['ArrowDown', ROOT, { kind: 'focus', key: SYSTEMS }],
    ['ArrowDown', MODULES, undefined],
    ['ArrowUp', SYSTEMS, { kind: 'focus', key: ROOT }],
    ['ArrowUp', ROOT, undefined],
    ['Home', MODULES, { kind: 'focus', key: ROOT }],
    ['End', ROOT, { kind: 'focus', key: MODULES }],
    ['ArrowRight', SYSTEMS, { kind: 'focus', key: DND }],
    ['ArrowRight', DND, { kind: 'expand', key: DND }],
    ['ArrowLeft', SYSTEMS, { kind: 'collapse', key: SYSTEMS }],
    ['ArrowLeft', PF2E, { kind: 'focus', key: SYSTEMS }],
    ['ArrowLeft', MODULES, { kind: 'focus', key: ROOT }],
    ['Enter', ROOT, undefined],
  ])('%s on %s', (key, current, move) => {
    expect(moveFor(rows, current, expanded, key)).toEqual(move);
  });

  test('ArrowRight on a row with nothing under it does nothing', () => {
    const overview = buildOverview(installation(), new Map());
    const shown = visibleRows(overview, new Set([ROOT, SYSTEMS]));

    expect(moveFor(shown, DND, new Set([ROOT, SYSTEMS]), 'ArrowRight')).toBeUndefined();
  });

  test('ArrowLeft on the collapsed root does nothing', () => {
    expect(moveFor(visibleRows(OVERVIEW, new Set()), ROOT, new Set(), 'ArrowLeft')).toBeUndefined();
  });

  test('a row no longer showing does nothing', () => {
    expect(moveFor(rows, `${SYSTEMS}/system:gone`, expanded, 'ArrowDown')).toBeUndefined();
  });
});
