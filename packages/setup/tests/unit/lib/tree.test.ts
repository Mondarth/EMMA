import { describe, expect, test } from 'vitest';

import { buildOverview } from '../../../src/lib/overview';
import type { TreeRow } from '../../../src/lib/tree';
import { keyOf, moveFor, ROOT, visibleRows } from '../../../src/lib/tree';
import { installation, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'a', title: 'A', system: 'dnd5e' },
      { id: 'b', title: 'B', system: 'dnd5e' },
    ],
    modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }],
  }),
  new Map([['a', recorded(record('a', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))]]),
);

/**
 * The keys of rows.
 * @param rows - The rows
 * @returns Their keys
 */
const keys = (rows: readonly TreeRow[]) => rows.map(({ key }) => key);

describe('keyOf', () => {
  test.each([
    [{ kind: 'root' } as const, 'root'],
    [{ kind: 'world', world: 'a' } as const, 'world:a'],
    [{ kind: 'module', world: 'a', module: 'lib' } as const, 'module:a:lib'],
  ])('%j is %s', (selection, key) => {
    expect(keyOf(selection)).toBe(key);
  });
});

describe('visibleRows', () => {
  test('shows only the root while it is collapsed', () => {
    expect(visibleRows(OVERVIEW, new Set())).toEqual([
      { key: ROOT, level: 1, selection: { kind: 'root' }, title: '', version: '14.368', expandable: true },
    ]);
  });

  test('shows the worlds under the root, each expandable if its record lists modules', () => {
    const rows = visibleRows(OVERVIEW, new Set([ROOT]));

    expect(rows.slice(1)).toEqual([
      {
        key: 'world:a',
        level: 2,
        selection: { kind: 'world', world: 'a' },
        title: 'A',
        status: 'matches',
        expandable: true,
        parent: ROOT,
      },
      {
        key: 'world:b',
        level: 2,
        selection: { kind: 'world', world: 'b' },
        title: 'B',
        status: 'unrecorded',
        expandable: false,
        parent: ROOT,
      },
    ]);
  });

  test("shows a world's modules under it once it is expanded", () => {
    const rows = visibleRows(OVERVIEW, new Set([ROOT, 'world:a']));

    expect(keys(rows)).toEqual([ROOT, 'world:a', 'module:a:lib', 'world:b']);
    expect(rows[2]).toEqual({
      key: 'module:a:lib',
      level: 3,
      selection: { kind: 'module', world: 'a', module: 'lib' },
      title: 'Library',
      version: '1.0.0',
      status: 'same',
      expandable: false,
      parent: 'world:a',
    });
  });
});

describe('moveFor', () => {
  const expanded = new Set([ROOT, 'world:a']);
  const rows = visibleRows(OVERVIEW, expanded);

  test.each([
    ['ArrowDown', ROOT, { kind: 'focus', key: 'world:a' }],
    ['ArrowDown', 'world:b', undefined],
    ['ArrowUp', 'world:a', { kind: 'focus', key: ROOT }],
    ['ArrowUp', ROOT, undefined],
    ['Home', 'world:b', { kind: 'focus', key: ROOT }],
    ['End', ROOT, { kind: 'focus', key: 'world:b' }],
    ['ArrowRight', 'world:a', { kind: 'focus', key: 'module:a:lib' }],
    ['ArrowRight', 'module:a:lib', undefined],
    ['ArrowLeft', 'world:a', { kind: 'collapse', key: 'world:a' }],
    ['ArrowLeft', 'module:a:lib', { kind: 'focus', key: 'world:a' }],
    ['ArrowLeft', 'world:b', { kind: 'focus', key: ROOT }],
    ['Enter', ROOT, undefined],
  ])('%s on %s', (key, current, move) => {
    expect(moveFor(rows, current, expanded, key)).toEqual(move);
  });

  test('ArrowRight expands a collapsed row', () => {
    expect(moveFor(rows, ROOT, new Set(), 'ArrowRight')).toEqual({ kind: 'expand', key: ROOT });
  });

  test('ArrowLeft on the collapsed root does nothing', () => {
    expect(moveFor(visibleRows(OVERVIEW, new Set()), ROOT, new Set(), 'ArrowLeft')).toBeUndefined();
  });

  test('a row no longer showing does nothing', () => {
    expect(moveFor(rows, 'world:gone', expanded, 'ArrowDown')).toBeUndefined();
  });
});
