import type { ModuleEntry } from '@module/adapters/modules';
import { format, formatList } from '@module/lib/i18n';
import type { ModuleState } from '@module/state/module-state.svelte';

/**
 * Explain why a module is locked active, for a tooltip on its entry in either view.
 * @param modules - The modules and their staged activation
 * @param entry - The module
 * @returns The explanation, naming the active modules that require it, or `undefined` if it is not locked
 */
export function lockedTooltip(modules: ModuleState, entry: ModuleEntry): string | undefined {
  const [parent, ...others] = modules.lockedBy(entry.id);
  if (parent === undefined) return undefined;
  // Foundry's localization has no plural rules, so one module and several have strings of their own.
  if (others.length === 0) {
    return format('MONDARTH-EMMA.Requirements.LockedOne', { module: entry.title, parent: parent.title });
  }
  return format('MONDARTH-EMMA.Requirements.LockedMany', {
    module: entry.title,
    parents: formatList([parent, ...others].map(({ title }) => title)),
  });
}
