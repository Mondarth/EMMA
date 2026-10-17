import { requestReload, writeActivation } from '@module/adapters/modules';
import { format, formatList, localize } from '@module/lib/i18n';
import { log } from '@module/lib/logger';
import type { ModuleState } from '@module/state/module-state.svelte';

/**
 * Save the staged activation and, if it changed, ask the user to reload the world so it takes effect. Problems are
 * reported to the user as notifications rather than thrown, so the caller only learns whether anything was saved.
 *
 * An activation with unmet requirements is refused here as well as in the UI, since Foundry would load modules
 * without the modules they need.
 * @param modules - The state to save
 * @returns `true` if the activation was saved and changed
 */
export async function saveModules(modules: ModuleState): Promise<boolean> {
  const [unmet] = modules.unmet;
  if (unmet !== undefined) {
    ui.notifications?.error(
      format('MONDARTH-EMMA.Requirements.Unmet', { module: unmet.entry.title, missing: formatList(unmet.missing) }),
    );
    return false;
  }

  let changed: boolean;
  try {
    changed = await writeActivation(modules.activation);
  } catch (error) {
    log.error('Unable to save the module configuration', error);
    ui.notifications?.error(localize('MONDARTH-EMMA.Errors.SaveFailed'));
    return false;
  }

  modules.markSaved();
  if (changed) await requestReload();
  return changed;
}
