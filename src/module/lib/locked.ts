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
  const parents = modules.lockedBy(entry.id);
  if (parents.length === 0) return undefined;
  return format('MONDARTH-EMMA.Requirements.Locked', {
    module: entry.title,
    parents: formatList(parents.map(({ title }) => title)),
  });
}
