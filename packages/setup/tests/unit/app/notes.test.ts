import { describe, expect, test, vi } from 'vitest';

import { MAX_NOTE_LENGTH, NoteState } from '../../../src/app/notes.svelte';
import type { NoteStore } from '../../../src/app/notes.svelte';

/**
 * A store holding these notes, recording what it is asked to keep.
 * @param notes - The notes it holds at first
 * @returns The store
 */
function storeOf(notes: Record<string, string> = {}) {
  const write = vi.fn<NoteStore['write']>();
  return { read: () => notes, write };
}

describe('the notes', () => {
  test("are the store's, each by what it is on and its item", () => {
    const notes = new NoteState(storeOf({ 'ignore:module:dice': 'Rolls wrongly', 'lock:core': 'Stay on 13' }));
    expect(notes.canKeep).toBe(true);
    expect(notes.of('ignore', 'module:dice')).toBe('Rolls wrongly');
    expect(notes.of('lock', 'core')).toBe('Stay on 13');
    expect(notes.of('pin', 'core')).toBeUndefined();
  });

  test('keep a note without the space around it, cut to its length, and remove one emptied', () => {
    const store = storeOf();
    const notes = new NoteState(store);

    notes.set('pin', 'module:a', '  Waiting for 2.1  ');
    expect(notes.of('pin', 'module:a')).toBe('Waiting for 2.1');
    expect(store.write).toHaveBeenLastCalledWith({ 'pin:module:a': 'Waiting for 2.1' });
    notes.set('lock', 'system:dnd5e', 'x'.repeat(MAX_NOTE_LENGTH + 5));
    expect(notes.of('lock', 'system:dnd5e')).toHaveLength(MAX_NOTE_LENGTH);

    notes.set('pin', 'module:a', '   ');
    expect(notes.of('pin', 'module:a')).toBeUndefined();
    expect(store.write).toHaveBeenLastCalledWith({ 'lock:system:dnd5e': 'x'.repeat(MAX_NOTE_LENGTH) });
  });

  test('are not kept again when nothing changes', () => {
    const store = storeOf({ 'lock:core': 'Stay on 13' });
    const notes = new NoteState(store);
    notes.set('lock', 'core', ' Stay on 13 ');
    notes.set('pin', 'core', '');
    expect(store.write).not.toHaveBeenCalled();
  });

  test('keep only those on what is still held, kept only if one goes', () => {
    const store = storeOf({ 'ignore:world:a': 'Old campaign', 'lock:module:lib': 'Breaks at 2', 'pin:core': '13' });
    const notes = new NoteState(store);

    notes.keepOnly(() => true);
    expect(store.write).not.toHaveBeenCalled();
    notes.keepOnly((kind, key) => !(kind === 'lock' && key === 'module:lib'));
    expect(store.write).toHaveBeenLastCalledWith({ 'ignore:world:a': 'Old campaign', 'pin:core': '13' });
    expect(notes.of('lock', 'module:lib')).toBeUndefined();
  });

  test('are kept for this visit alone without a store', () => {
    const notes = new NoteState();
    expect(notes.canKeep).toBe(false);
    notes.set('ignore', 'world:a', 'For now');
    expect(notes.of('ignore', 'world:a')).toBe('For now');
  });
});
