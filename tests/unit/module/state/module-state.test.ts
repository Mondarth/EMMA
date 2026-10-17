import { describe, expect, test } from 'vitest';

import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';
import type { Side } from '@module/state/module-state.svelte';
import { ModuleState } from '@module/state/module-state.svelte';

/**
 * Build a module entry.
 * @param id - The module ID, also used as its title
 * @param requires - The IDs of the modules it requires
 * @returns The entry
 */
function entry(id: string, requires: string[] = []): ModuleEntry {
  return { id, title: id, version: '1.0.0', authors: [], requires };
}

const ENTRIES = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => entry(id));

/**
 * Create the state for {@link ENTRIES}: by default a, c and e inactive, b, d and f active.
 * @param saved - The saved activation
 * @returns The state
 */
function createState(saved: ActivationMap = { b: true, d: true, f: true }): ModuleState {
  return new ModuleState(ENTRIES, saved);
}

/**
 * The IDs of the modules on one side.
 * @param state - The state
 * @param side - The side
 * @returns The module IDs, in display order
 */
function ids(state: ModuleState, side: Side): string[] {
  return state[side].map(({ id }) => id);
}

describe('ModuleState', () => {
  describe('initial state', () => {
    test('splits the modules by their saved activation, keeping display order', () => {
      const state = createState();

      expect(ids(state, 'inactive')).toEqual(['a', 'c', 'e']);
      expect(ids(state, 'active')).toEqual(['b', 'd', 'f']);
    });

    test('treats modules missing from the saved activation as inactive', () => {
      const state = createState({});

      expect(ids(state, 'inactive')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(ids(state, 'active')).toEqual([]);
    });

    test('ignores saved modules it does not know', () => {
      const state = createState({ removed: true });

      expect(state.activation).not.toHaveProperty('removed');
      expect(state.isActive('removed')).toBe(false);
    });

    test('starts clean, with nothing selected', () => {
      const state = createState();

      expect(state.dirty).toBe(false);
      expect(state.changes).toEqual({});
      expect(state.selected('inactive').size).toBe(0);
      expect(state.selected('active').size).toBe(0);
    });

    test('reports the activation of every module', () => {
      const state = createState();

      expect(state.activation).toEqual({ a: false, b: true, c: false, d: true, e: false, f: true });
      expect(state.isActive('b')).toBe(true);
      expect(state.isActive('a')).toBe(false);
    });

    test('hands out copies of the activation', () => {
      const state = createState();
      const activation = state.activation as Record<string, boolean>;

      activation.a = true;

      expect(state.isActive('a')).toBe(false);
    });
  });

  describe('select', () => {
    test('replaces the selection by default', () => {
      const state = createState();

      state.select('inactive', 'a');
      state.select('inactive', 'c');

      expect([...state.selected('inactive')]).toEqual(['c']);
      expect(state.isSelected('inactive', 'c')).toBe(true);
      expect(state.isSelected('inactive', 'a')).toBe(false);
    });

    test('toggles one module in or out of the selection', () => {
      const state = createState();

      state.select('inactive', 'a', 'toggle');
      state.select('inactive', 'c', 'toggle');
      state.select('inactive', 'a', 'toggle');

      expect([...state.selected('inactive')]).toEqual(['c']);
    });

    test('selects a range from the last click, in display order', () => {
      const state = createState({});

      state.select('inactive', 'b');
      state.select('inactive', 'e', 'range');

      expect([...state.selected('inactive')].sort()).toEqual(['b', 'c', 'd', 'e']);
    });

    test('selects a range upwards', () => {
      const state = createState({});

      state.select('inactive', 'e');
      state.select('inactive', 'b', 'range');

      expect([...state.selected('inactive')].sort()).toEqual(['b', 'c', 'd', 'e']);
    });

    test('keeps the range anchor across range clicks', () => {
      const state = createState({});

      state.select('inactive', 'c');
      state.select('inactive', 'f', 'range');
      state.select('inactive', 'a', 'range');

      expect([...state.selected('inactive')].sort()).toEqual(['a', 'b', 'c']);
    });

    test('anchors a range at a toggled module', () => {
      const state = createState({});

      state.select('inactive', 'a');
      state.select('inactive', 'd', 'toggle');
      state.select('inactive', 'f', 'range');

      expect([...state.selected('inactive')].sort()).toEqual(['d', 'e', 'f']);
    });

    test('treats a range click with no anchor as a plain click', () => {
      const state = createState();

      state.select('inactive', 'c', 'range');

      expect([...state.selected('inactive')]).toEqual(['c']);
    });

    test('ranges only over the modules on that side', () => {
      const state = createState();

      state.select('inactive', 'a');
      state.select('inactive', 'e', 'range');

      expect([...state.selected('inactive')].sort()).toEqual(['a', 'c', 'e']);
    });

    test('ignores modules that are not on that side', () => {
      const state = createState();

      state.select('inactive', 'b');
      state.select('inactive', 'unknown');

      expect(state.selected('inactive').size).toBe(0);
    });

    test('keeps each side’s selection separate', () => {
      const state = createState();

      state.select('inactive', 'a');
      state.select('active', 'b');

      expect([...state.selected('inactive')]).toEqual(['a']);
      expect([...state.selected('active')]).toEqual(['b']);
    });
  });

  describe('selectAll', () => {
    test('selects every module on that side only', () => {
      const state = createState();

      state.selectAll('inactive');

      expect([...state.selected('inactive')].sort()).toEqual(['a', 'c', 'e']);
      expect(state.selected('active').size).toBe(0);
    });

    test('keeps the range anchor', () => {
      const state = createState({});
      state.select('inactive', 'c');

      state.selectAll('inactive');
      state.select('inactive', 'e', 'range');

      expect([...state.selected('inactive')].sort()).toEqual(['c', 'd', 'e']);
    });
  });

  describe('clearSelection', () => {
    test('deselects everything on that side only', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.select('active', 'b');

      state.clearSelection('inactive');

      expect(state.selected('inactive').size).toBe(0);
      expect([...state.selected('active')]).toEqual(['b']);
    });

    test('forgets the range anchor', () => {
      const state = createState({});
      state.select('inactive', 'a');

      state.clearSelection('inactive');
      state.select('inactive', 'c', 'range');

      expect([...state.selected('inactive')]).toEqual(['c']);
    });
  });

  describe('activateSelected', () => {
    test('stages the selected inactive modules to become active', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.select('inactive', 'e', 'toggle');

      expect(state.activateSelected()).toBe(2);

      expect(ids(state, 'inactive')).toEqual(['c']);
      expect(ids(state, 'active')).toEqual(['a', 'b', 'd', 'e', 'f']);
      expect(state.changes).toEqual({ a: true, e: true });
      expect(state.dirty).toBe(true);
    });

    test('selects the moved modules on the active side instead', () => {
      const state = createState();
      state.select('active', 'b');
      state.select('inactive', 'a');

      state.activateSelected();

      expect(state.selected('inactive').size).toBe(0);
      expect([...state.selected('active')]).toEqual(['a']);
    });

    test('does nothing with nothing selected', () => {
      const state = createState();
      state.select('active', 'b');

      expect(state.activateSelected()).toBe(0);

      expect(state.dirty).toBe(false);
      expect([...state.selected('active')]).toEqual(['b']);
    });

    test('does not change what is saved', () => {
      const state = createState();
      state.select('inactive', 'a');

      state.activateSelected();
      state.reset();

      expect(state.isActive('a')).toBe(false);
    });
  });

  describe('deactivateSelected', () => {
    test('stages the selected active modules to become inactive', () => {
      const state = createState();
      state.select('active', 'b');
      state.select('active', 'f', 'range');

      expect(state.deactivateSelected()).toBe(3);

      expect(ids(state, 'active')).toEqual([]);
      expect(ids(state, 'inactive')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(state.changes).toEqual({ b: false, d: false, f: false });
      expect([...state.selected('inactive')].sort()).toEqual(['b', 'd', 'f']);
    });

    test('undoes an activation, leaving nothing staged', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.activateSelected();

      state.deactivateSelected();

      expect(state.dirty).toBe(false);
      expect(state.changes).toEqual({});
      expect(ids(state, 'inactive')).toEqual(['a', 'c', 'e']);
    });
  });

  describe('setActive', () => {
    test('stages one module to become active or inactive', () => {
      const state = createState();

      state.setActive('a', true);
      state.setActive('b', false);

      expect(state.changes).toEqual({ a: true, b: false });
      expect(ids(state, 'active')).toEqual(['a', 'd', 'f']);
    });

    test('leaves nothing staged when set back to what is saved', () => {
      const state = createState();

      state.setActive('a', true);
      state.setActive('a', false);

      expect(state.dirty).toBe(false);
    });

    test('deselects the module on both sides', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.select('inactive', 'c', 'toggle');

      state.setActive('a', true);

      expect([...state.selected('inactive')]).toEqual(['c']);
      expect(state.selected('active').size).toBe(0);
    });

    test('ignores modules it does not know', () => {
      const state = createState();

      state.setActive('unknown', true);

      expect(state.dirty).toBe(false);
      expect(state.activation).not.toHaveProperty('unknown');
    });
  });

  describe('reset', () => {
    test('discards staged changes and both selections', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.activateSelected();
      state.select('inactive', 'c');

      state.reset();

      expect(state.dirty).toBe(false);
      expect(ids(state, 'active')).toEqual(['b', 'd', 'f']);
      expect(state.selected('inactive').size).toBe(0);
      expect(state.selected('active').size).toBe(0);
    });
  });

  describe('markSaved', () => {
    test('makes the staged activation the new baseline', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.activateSelected();

      state.markSaved();

      expect(state.dirty).toBe(false);
      expect(state.isActive('a')).toBe(true);
    });

    test('measures later changes from the new baseline', () => {
      const state = createState();
      state.select('inactive', 'a');
      state.activateSelected();
      state.markSaved();

      state.deactivateSelected();

      expect(state.changes).toEqual({ a: false });
      state.reset();
      expect(state.isActive('a')).toBe(true);
    });
  });

  describe('unmet', () => {
    const LIBRARY = [entry('app', ['lib', 'extra']), entry('extra'), entry('lib'), entry('other', ['gone'])];

    test('is empty while every active module has what it requires', () => {
      const state = new ModuleState(LIBRARY, { app: true, extra: true, lib: true });

      expect(state.unmet).toEqual([]);
    });

    test('lists active modules whose required modules will not be active, by title', () => {
      const state = new ModuleState(LIBRARY, { app: true, extra: true, lib: true });

      state.setActive('lib', false);
      state.setActive('extra', false);

      expect(state.unmet).toEqual([{ entry: LIBRARY[0], missing: ['lib', 'extra'] }]);
    });

    test('ignores inactive modules', () => {
      const state = new ModuleState(LIBRARY, {});

      expect(state.unmet).toEqual([]);
    });

    test('names a required module that is not installed by its ID', () => {
      const state = new ModuleState(LIBRARY, {});

      state.setActive('other', true);

      expect(state.unmet).toEqual([{ entry: LIBRARY[3], missing: ['gone'] }]);
    });

    test('clears once the required modules are staged too', () => {
      const state = new ModuleState(LIBRARY, {});
      state.setActive('app', true);

      state.select('inactive', 'extra');
      state.select('inactive', 'lib', 'toggle');
      state.activateSelected();

      expect(state.unmet).toEqual([]);
    });
  });
});
