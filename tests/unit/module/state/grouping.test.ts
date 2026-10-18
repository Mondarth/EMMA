import { describe, expect, test } from 'vitest';

import type { ModuleEntry } from '@module/adapters/modules';
import type { ModuleRow } from '@module/state/grouping';
import { groupRows, relatedModules, withRequired } from '@module/state/grouping';
import { moduleEntry } from '../../mocks/entries';

/**
 * Build a module entry with requirements and recommendations.
 * @param id - The module ID, also used as its title
 * @param requires - The IDs of the modules it requires
 * @param recommends - The IDs of the modules it recommends
 * @returns The entry
 */
function entry(id: string, requires: string[] = [], recommends: string[] = []): ModuleEntry {
  return moduleEntry({
    id,
    requires,
    relationships: {
      systems: [],
      requires: requires.map(required => ({ id: required, type: 'module', title: required })),
      recommends: recommends.map(recommended => ({ id: recommended, type: 'module', title: recommended })),
      conflicts: [],
    },
  });
}

/**
 * Describe rows compactly: each module's ID, indented two spaces per level, with its relation.
 * @param rows - The rows
 * @returns One line per row
 */
function outline(rows: readonly ModuleRow[]): string[] {
  return rows.map(
    ({ entry: { id }, depth, relation }) => `${'  '.repeat(depth)}${id}${relation ? ` (${relation})` : ''}`,
  );
}

describe('relatedModules', () => {
  const ENTRIES = ['a', 'b', 'c', 'd'].map(id => entry(id));

  /**
   * The IDs of the modules related to one, by relation.
   * @param related - The related modules
   * @returns Their IDs
   */
  function ids(related: ReturnType<typeof relatedModules>) {
    return { required: related.required.map(({ id }) => id), recommended: related.recommended.map(({ id }) => id) };
  }

  test('gives the required, then the recommended, modules installed, in display order', () => {
    expect(ids(relatedModules(entry('a', ['d', 'b', 'gone'], ['c', 'gone']), ENTRIES))).toEqual({
      required: ['b', 'd'],
      recommended: ['c'],
    });
  });

  test('leaves out a recommended module that is also required, repeats, and the module itself', () => {
    expect(ids(relatedModules(entry('a', ['b', 'b', 'a'], ['b', 'c', 'c', 'a']), ENTRIES))).toEqual({
      required: ['b'],
      recommended: ['c'],
    });
  });

  test('leaves out recommended packages that are not modules', () => {
    const withSystem = moduleEntry({
      id: 'a',
      relationships: {
        systems: [],
        requires: [],
        recommends: [{ id: 'b', type: 'system', title: 'b' }],
        conflicts: [],
      },
    });

    expect(ids(relatedModules(withSystem, ENTRIES))).toEqual({ required: [], recommended: [] });
  });
});

describe('groupRows', () => {
  const ENTRIES = [entry('a', ['c'], ['d']), entry('b'), entry('c'), entry('d'), entry('e', ['c'])];

  test('lists every module at its own place when no module is a parent', () => {
    expect(outline(groupRows(ENTRIES, () => false))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('moves required, then recommended, modules under their parent', () => {
    expect(outline(groupRows(ENTRIES, id => id === 'a'))).toEqual([
      'a',
      '  c (required)',
      '  d (recommended)',
      'b',
      'e',
    ]);
  });

  test('repeats a module under each parent that relates to it', () => {
    const rows = groupRows(ENTRIES, id => id === 'a' || id === 'e');

    expect(outline(rows)).toEqual(['a', '  c (required)', '  d (recommended)', 'b', 'e', '  c (required)']);
    expect(new Set(rows.map(({ key }) => key)).size).toBe(rows.length);
    expect(rows.filter(({ entry: { id } }) => id === 'c').map(({ key }) => key)).toEqual(['a/c', 'e/c']);
  });

  test('follows the chain under a grouped parent', () => {
    const chain = [entry('a', ['b']), entry('b', ['c']), entry('c')];

    expect(outline(groupRows(chain, () => true))).toEqual(['a', '  b (required)', '    c (required)']);
  });

  test('stops the chain at a module that is not a parent', () => {
    const chain = [entry('a', ['b']), entry('b', ['c']), entry('c')];

    expect(outline(groupRows(chain, id => id === 'a'))).toEqual(['a', '  b (required)', 'c']);
  });

  test('shows modules that require each other at their own place, cutting the loop', () => {
    const loop = [entry('a', ['b']), entry('b', ['a']), entry('c')];

    expect(outline(groupRows(loop, () => true))).toEqual(['a', '  b (required)', 'c']);
  });
});

describe('withRequired', () => {
  const CHAIN = [entry('a', ['b']), entry('b', ['c']), entry('c'), entry('d', ['c'])];

  test('adds what the modules require, following the chain, in display order', () => {
    expect(withRequired(CHAIN, ['d', 'a'], () => false)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('leaves out a skipped module and what only it requires', () => {
    expect(withRequired(CHAIN, ['a'], id => id === 'b')).toEqual(['a']);
  });

  test('ignores modules not among the entries', () => {
    expect(withRequired(CHAIN, ['gone'], () => false)).toEqual([]);
  });
});
