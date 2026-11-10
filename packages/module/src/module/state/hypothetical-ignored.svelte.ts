/**
 * The modules hypothetical mode ignores, such as one with no manifest a source can read, which it would otherwise
 * always find problematic: kept in a world setting, and mirrored here so that every window shows a change at once.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

/** The IDs of the modules hypothetical mode ignores, read reactively. */
export const ignoredModules = new SvelteSet<string>();

/**
 * Make the modules ignored those given, as the setting now holds them.
 * @param ids - The module IDs
 */
export function setIgnoredModules(ids: Iterable<string>): void {
  const given = [...ids];
  for (const id of ignoredModules) if (!given.includes(id)) ignoredModules.delete(id);
  for (const id of given) ignoredModules.add(id);
}

/** The GMs' notes on the modules hypothetical mode ignores, such as why, by module ID, read reactively. */
export const ignoredNotes = new SvelteMap<string, string>();

/**
 * Make the notes those given, as the setting now holds them.
 * @param notes - The notes, by module ID
 */
export function setIgnoredNotes(notes: Readonly<Record<string, string>>): void {
  for (const id of ignoredNotes.keys()) if (!(id in notes)) ignoredNotes.delete(id);
  for (const [id, note] of Object.entries(notes)) if (ignoredNotes.get(id) !== note) ignoredNotes.set(id, note);
}

/**
 * The note on a module hypothetical mode ignores. Its callers ask only of a module ignored; a note goes with the ignore.
 * @param id - The module ID
 * @returns The note, or `undefined` for none
 */
export function ignoredNoteOf(id: string): string | undefined {
  return ignoredNotes.get(id);
}
