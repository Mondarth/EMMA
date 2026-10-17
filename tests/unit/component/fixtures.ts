import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';
import { ModuleState } from '@module/state/module-state.svelte';

/** Three installed modules, in display order. */
export const ENTRIES: readonly ModuleEntry[] = [
  { id: 'dice', title: 'Dice So Nice!', version: '5.2.4', authors: ['Simone', 'JDW'] },
  { id: 'emma', title: 'EMMA', version: '0.1.0', authors: [] },
  { id: 'lib-wrapper', title: 'libWrapper', version: '1.13.2', authors: ['ruipin'] },
];

/**
 * Create the state for {@link ENTRIES}: by default only libWrapper is active.
 * @param saved - The saved activation
 * @param entries - The installed modules
 * @returns The state
 */
export function createModules(
  saved: ActivationMap = { 'lib-wrapper': true },
  entries: readonly ModuleEntry[] = ENTRIES,
): ModuleState {
  return new ModuleState(entries, saved);
}
