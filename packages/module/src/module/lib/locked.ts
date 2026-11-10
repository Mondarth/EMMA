import type { ModuleEntry } from '@module/adapters/modules';
import { format, formatList, localize } from '@module/lib/i18n';
import { ignoredNoteOf } from '@module/state/hypothetical-ignored.svelte';
import type { ModuleState } from '@module/state/module-state.svelte';

/**
 * Explain why a module is locked, for a tooltip on its entry in either view: active because active modules require it,
 * or kept from being activated as it, or modules it requires, are judged incompatible.
 * @param modules - The modules and their staged activation
 * @param entry - The module
 * @returns The explanation, naming the modules that lock it, or `undefined` if it is not locked
 */
export function lockedTooltip(modules: ModuleState, entry: ModuleEntry): string | undefined {
  const blocked = modules.blockedBy(entry.id);
  if (blocked.length > 0) {
    const required = blocked.filter(({ id }) => id !== entry.id);
    return required.length === 0
      ? format('MONDARTH-EMMA.Requirements.Incompatible', { module: entry.title })
      : format('MONDARTH-EMMA.Requirements.RequiresIncompatible', {
          module: entry.title,
          modules: formatList(required.map(({ title }) => title)),
        });
  }
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

/**
 * Explain why hypothetical mode leaves a module out, for a tooltip on its entry in either view, with the GMs' note on
 * it, if any.
 * @param id - The module's ID
 * @returns The explanation
 */
export function ignoredTooltip(id: string): string {
  const note = ignoredNoteOf(id);
  const why = localize('MONDARTH-EMMA.Ignore.Tooltip');
  return note === undefined ? why : `${why} ${format('MONDARTH-EMMA.Ignore.Noted', { note })}`;
}
