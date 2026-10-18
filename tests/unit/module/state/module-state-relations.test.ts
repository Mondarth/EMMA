import { describe, expect, test } from 'vitest';

import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';
import type { ModuleStateOptions } from '@module/state/module-state.svelte';
import { ModuleState } from '@module/state/module-state.svelte';
import { moduleEntry } from '../../mocks/entries';

/**
 * Build a module entry with relationships to other modules.
 * @param id - The module ID, also used as its title
 * @param relations - The IDs of the modules it requires, recommends and conflicts with
 * @param relations.requires - Modules it requires
 * @param relations.recommends - Modules it recommends
 * @param relations.conflicts - Modules it conflicts with
 * @returns The entry
 */
function entry(
  id: string,
  {
    requires = [],
    recommends = [],
    conflicts = [],
  }: Partial<Record<'requires' | 'recommends' | 'conflicts', string[]>> = {},
): ModuleEntry {
  const related = (ids: string[]) => ids.map(other => ({ id: other, type: 'module' as const, title: other }));
  return moduleEntry({
    id,
    requires,
    relationships: {
      systems: [],
      requires: related(requires),
      recommends: related(recommends),
      conflicts: related(conflicts),
    },
  });
}

/**
 * The modules a {@link ModuleState} will make active.
 * @param state - The state
 * @returns Their IDs, in display order
 */
function activeIds(state: ModuleState): string[] {
  return state.active.map(({ id }) => id);
}

// app requires lib and recommends extra; lib requires core; tool requires lib; rival conflicts with lib.
const ENTRIES = [
  entry('app', { requires: ['lib'], recommends: ['extra'] }),
  entry('core'),
  entry('extra'),
  entry('lib', { requires: ['core'] }),
  entry('rival', { conflicts: ['lib'] }),
  entry('tool', { requires: ['lib'] }),
];

/**
 * Create a state over {@link ENTRIES}.
 * @param saved - The saved activation; nothing is active by default
 * @param options - The state's options
 * @returns The state
 */
function createState(saved: ActivationMap = {}, options: ModuleStateOptions = {}): ModuleState {
  return new ModuleState(ENTRIES, saved, options);
}

describe('activating a module', () => {
  test('activates the modules it requires, following the chain', () => {
    const state = createState();

    state.setActive('app', true);

    expect(activeIds(state)).toEqual(['app', 'core', 'lib']);
    expect(state.isImplied('lib')).toBe(true);
    expect(state.isImplied('core')).toBe(true);
    expect(state.isImplied('app')).toBe(false);
  });

  test('leaves recommended modules alone unless told to activate them', () => {
    const state = createState();

    state.setActive('app', true);

    expect(state.isActive('extra')).toBe(false);
  });

  test('activates recommended modules too when the setting says so, read at the time', () => {
    let auto = false;
    const state = createState({}, { autoRecommended: () => auto });
    auto = true;

    state.setActive('app', true);

    expect(activeIds(state)).toEqual(['app', 'core', 'extra', 'lib']);
    expect(state.isImplied('extra')).toBe(true);
  });

  test('does not mark modules already active as implied', () => {
    const state = createState({ lib: true, core: true });

    state.setActive('app', true);

    expect(state.isImplied('lib')).toBe(false);
  });

  test('deselects the modules it activates on both sides', () => {
    const state = createState();
    state.select('inactive', 'lib');

    state.setActive('app', true);

    expect(state.selected('inactive').size).toBe(0);
    expect(state.selected('active').size).toBe(0);
  });

  test('copes with modules that require each other', () => {
    const state = new ModuleState([entry('a', { requires: ['b'] }), entry('b', { requires: ['a'] })], {});

    state.setActive('a', true);
    expect(activeIds(state)).toEqual(['a', 'b']);

    state.setActive('a', false);
    expect(activeIds(state)).toEqual([]);
  });
});

describe('deactivating a module', () => {
  test('deactivates the modules activated only for it, following the chain', () => {
    const state = createState();
    state.setActive('app', true);

    state.setActive('app', false);

    expect(activeIds(state)).toEqual([]);
    expect(state.dirty).toBe(false);
  });

  test('keeps those another active module still needs', () => {
    const state = createState();
    state.setActive('app', true);
    state.setActive('tool', true);

    state.setActive('app', false);

    expect(activeIds(state)).toEqual(['core', 'lib', 'tool']);
  });

  test('keeps modules that were active before', () => {
    const state = createState({ lib: true });
    state.setActive('app', true);

    state.setActive('app', false);

    expect(activeIds(state)).toEqual(['core', 'lib']);
  });

  test('keeps modules the user activated themselves', () => {
    const state = createState();
    state.setActive('app', true);
    state.setActive('lib', true);

    state.setActive('app', false);

    expect(activeIds(state)).toEqual(['core', 'lib']);
  });

  test('refuses to deactivate a module an active module requires', () => {
    const state = createState();
    state.setActive('app', true);

    state.setActive('lib', false);
    state.setActive('core', false);

    expect(activeIds(state)).toEqual(['app', 'core', 'lib']);
  });

  test('forgets which modules were implied once the changes are reset or saved', () => {
    const reset = createState();
    reset.setActive('app', true);
    reset.reset();
    expect(reset.isImplied('lib')).toBe(false);

    const saved = createState();
    saved.setActive('app', true);
    saved.markSaved();
    saved.setActive('app', false);
    expect(activeIds(saved)).toEqual(['core', 'lib']);
  });
});

describe('rows', () => {
  test('groups the modules an active module requires and recommends under it', () => {
    const state = createState();

    state.setActive('app', true);

    expect(state.rows.map(({ key, relation }) => [key, relation])).toEqual([
      ['app', null],
      ['app/lib', 'required'],
      ['app/lib/core', 'required'],
      ['app/extra', 'recommended'],
      ['rival', null],
      ['tool', null],
    ]);
  });
});

describe('conflicted', () => {
  test('lists the inactive modules that conflict with an active one, whichever declares it', () => {
    const state = new ModuleState([entry('a', { conflicts: ['b'] }), entry('b'), entry('c', { conflicts: ['a'] })], {});
    expect([...state.conflicted]).toEqual([]);

    state.setActive('a', true);

    expect([...state.conflicted]).toEqual(['b', 'c']);
  });

  test('follows modules activated for another', () => {
    const state = createState();

    state.setActive('app', true);

    expect([...state.conflicted]).toEqual(['rival']);
  });
});

describe('locking', () => {
  test('locks a module while an active module requires it, naming those that do', () => {
    const state = createState();
    expect(state.isLocked('lib')).toBe(false);

    state.setActive('app', true);
    state.setActive('tool', true);

    expect(state.lockedBy('lib').map(({ id }) => id)).toEqual(['app', 'tool']);
    expect(state.isLocked('lib')).toBe(true);
    expect(state.isLocked('core')).toBe(true);
    expect(state.isLocked('app')).toBe(false);

    state.setActive('app', false);
    state.setActive('tool', false);

    expect(state.isLocked('lib')).toBe(false);
  });

  test('does not lock an inactive module', () => {
    const state = new ModuleState(ENTRIES, { app: true });

    expect(state.isLocked('lib')).toBe(false);
  });

  test('does not lock modules that require each other, so neither is stuck', () => {
    const state = new ModuleState([entry('a', { requires: ['b'] }), entry('b', { requires: ['a'] })], {
      a: true,
      b: true,
    });

    expect(state.lockedBy('a')).toEqual([]);
    expect(state.isLocked('b')).toBe(false);
  });

  test('cannot be selected on the active side, alone, in a range or with everything', () => {
    const state = createState();
    state.setActive('app', true);

    state.select('active', 'lib');
    expect(state.selected('active').size).toBe(0);

    state.select('active', 'app');
    state.select('active', 'lib', 'toggle');
    expect([...state.selected('active')]).toEqual(['app']);

    state.clearSelection('active');
    state.selectAll('active');
    expect([...state.selected('active')]).toEqual(['app']);
  });

  test('leaves locked modules out of a range on the active side', () => {
    const state = new ModuleState(ENTRIES, { app: true, core: true, extra: true, lib: true });

    // core is locked by lib, which app requires.
    state.select('active', 'app');
    state.select('active', 'extra', 'range');

    expect([...state.selected('active')]).toEqual(['app', 'extra']);
  });
});

describe('selecting in the split view', () => {
  test('selects the modules a selected module requires on the same side, following the chain', () => {
    const state = createState();

    state.select('inactive', 'app');

    expect([...state.selected('inactive')]).toEqual(['app', 'core', 'lib']);
    expect(state.isSelected('inactive', 'extra')).toBe(false);
  });

  test('drops them again when the module is deselected, unless another selected module requires them', () => {
    const state = createState();
    state.select('inactive', 'app');
    state.select('inactive', 'tool', 'toggle');

    state.select('inactive', 'app', 'toggle');

    expect([...state.selected('inactive')]).toEqual(['core', 'lib', 'tool']);

    state.select('inactive', 'tool', 'toggle');

    expect(state.selected('inactive').size).toBe(0);
  });

  test('ignores a toggle on a module selected only because a selected module requires it', () => {
    const state = createState();
    state.select('inactive', 'app');

    state.select('inactive', 'lib', 'toggle');

    expect(state.isSelected('inactive', 'lib')).toBe(true);
    state.select('inactive', 'app', 'toggle');
    expect(state.isSelected('inactive', 'lib')).toBe(false);
  });

  test('does not select required modules on the other side', () => {
    const state = createState({ lib: true, core: true });

    state.select('inactive', 'app');

    expect([...state.selected('inactive')]).toEqual(['app']);
  });
});

describe('moving in the split view', () => {
  test('activating moves what the modules require with them, selecting the modules moved that are not locked', () => {
    const state = createState();
    state.select('inactive', 'app');

    expect(state.activateSelected()).toBe(3);

    expect(activeIds(state)).toEqual(['app', 'core', 'lib']);
    expect(state.isLocked('lib')).toBe(true);
    expect([...state.selected('active')]).toEqual(['app']);
  });

  test('activating brings a requirement the user could not see selected, such as one on a range edge', () => {
    const state = createState();
    // core is required by lib, which app requires; only app is chosen.
    state.select('inactive', 'tool');

    state.activateSelected();

    expect(activeIds(state)).toEqual(['core', 'lib', 'tool']);
  });

  test('activating brings recommended modules too when the setting says so', () => {
    const state = createState({}, { autoRecommended: () => true });
    state.select('inactive', 'app');

    state.activateSelected();

    expect(activeIds(state)).toEqual(['app', 'core', 'extra', 'lib']);
  });

  test('deactivating releases the modules activated only for the modules moved', () => {
    const state = createState();
    state.select('inactive', 'app');
    state.activateSelected();

    state.deactivateSelected();

    expect(activeIds(state)).toEqual([]);
    expect(state.dirty).toBe(false);
  });
});

describe('rowsOf', () => {
  /**
   * Describe a side's rows by key and relation.
   * @param state - The state
   * @param side - The side
   * @returns Each row's key and relation
   */
  function rowsOf(state: ModuleState, side: 'inactive' | 'active') {
    return state.rowsOf(side).map(({ key, relation }) => [key, relation]);
  }

  test('groups related modules under the selected modules on each side', () => {
    const state = createState();
    expect(rowsOf(state, 'inactive').every(([, relation]) => relation === null)).toBe(true);

    state.select('inactive', 'app');

    expect(rowsOf(state, 'inactive')).toEqual([
      ['app', null],
      ['app/lib', 'required'],
      ['app/lib/core', 'required'],
      ['app/extra', 'recommended'],
      ['rival', null],
      ['tool', null],
    ]);
  });

  test('groups an inactive recommended module under its selected active parent, for confirming', () => {
    const state = createState();
    state.select('inactive', 'app');
    state.activateSelected();

    expect(rowsOf(state, 'active')).toEqual([
      ['app', null],
      ['app/lib', 'required'],
      ['app/lib/core', 'required'],
      ['app/extra', 'recommended'],
    ]);
    expect(state.isActive('extra')).toBe(false);
    expect(rowsOf(state, 'inactive').map(([key]) => key)).toContain('extra');
  });

  test('stops showing the recommended module on the active side once its parent is deselected', () => {
    const state = createState();
    state.select('inactive', 'app');
    state.activateSelected();

    state.clearSelection('active');

    expect(rowsOf(state, 'active').map(([key]) => key)).toEqual(['app', 'core', 'lib']);
  });
});

describe('setAllActive', () => {
  test('activates every module, then deactivates every one, locked modules included', () => {
    const state = createState();
    expect(state.noneActive).toBe(true);
    expect(state.allActive).toBe(false);

    state.setAllActive(true);
    expect(state.allActive).toBe(true);
    expect(state.noneActive).toBe(false);
    expect(state.isLocked('lib')).toBe(true);

    state.setAllActive(false);
    expect(state.noneActive).toBe(true);
    expect(activeIds(state)).toEqual([]);
  });

  test('is neither all nor none with some modules active', () => {
    const state = createState({ app: true, lib: true, core: true });

    expect(state.allActive).toBe(false);
    expect(state.noneActive).toBe(false);
  });

  test('leaves no module implied, so deactivating one later leaves the others', () => {
    const state = createState();
    state.setActive('app', true);

    state.setAllActive(true);
    state.setActive('app', false);

    expect(state.isActive('lib')).toBe(true);
  });

  test('deselects every module on both sides', () => {
    const state = createState({ tool: true });
    state.select('inactive', 'rival');
    state.select('active', 'tool');

    state.setAllActive(true);

    expect(state.selected('inactive').size + state.selected('active').size).toBe(0);
  });

  test('never counts every module as active when none is installed', () => {
    const state = new ModuleState([], {});

    expect(state.allActive).toBe(false);
    expect(state.noneActive).toBe(true);
  });
});
