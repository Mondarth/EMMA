import { flushSync } from 'svelte';
import { afterEach, describe, expect, test } from 'vitest';

import type { ModuleEntry } from '@module/adapters/modules';
import { ModuleState } from '@module/state/module-state.svelte';

const ENTRIES: ModuleEntry[] = ['a', 'b', 'c'].map(id => ({
  id,
  title: id,
  version: '1.0.0',
  badge: null,
  description: '',
  authors: [],
  languages: [],
  requires: [],
}));

let cleanup: (() => void) | undefined;

/**
 * Track a value derived from the state in an effect, as a component would, recording each value it takes.
 * @param read - Reads the value from the state
 * @returns The values seen so far
 */
function track<T>(read: () => T): T[] {
  const seen: T[] = [];
  cleanup = $effect.root(() => {
    $effect(() => {
      seen.push(read());
    });
  });
  flushSync();
  return seen;
}

describe('ModuleState reactivity', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  test('updates the sides when modules move', () => {
    const state = new ModuleState(ENTRIES, { b: true });
    const active = track(() => state.active.map(({ id }) => id));

    state.select('inactive', 'a');
    state.activateSelected();
    flushSync();

    expect(active).toEqual([['b'], ['a', 'b']]);
  });

  test('updates the selection', () => {
    const state = new ModuleState(ENTRIES, {});
    const selected = track(() => state.isSelected('inactive', 'c'));

    state.select('inactive', 'c');
    flushSync();
    state.clearSelection('inactive');
    flushSync();

    expect(selected).toEqual([false, true, false]);
  });

  test('updates which drawers are open', () => {
    const state = new ModuleState(ENTRIES, {});
    const expanded = track(() => state.isExpanded('b'));

    state.toggleExpanded('b');
    flushSync();

    expect(expanded).toEqual([false, true]);
  });

  test('updates whether changes are staged', () => {
    const state = new ModuleState(ENTRIES, {});
    const dirty = track(() => state.dirty);

    state.select('inactive', 'a');
    state.activateSelected();
    flushSync();
    state.markSaved();
    flushSync();

    expect(dirty).toEqual([false, true, false]);
  });
});
