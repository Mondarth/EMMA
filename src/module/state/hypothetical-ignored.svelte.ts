/**
 * The modules hypothetical mode ignores, such as one with no manifest a source can read, which it would otherwise
 * always find problematic: kept in a world setting, and mirrored here so that every window shows a change at once.
 */
import { SvelteSet } from 'svelte/reactivity';

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
