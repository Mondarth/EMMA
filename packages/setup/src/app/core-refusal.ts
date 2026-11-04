/**
 * Why Foundry VTT cannot be updated in place to the build a plan chose, as far as it is known: the update plan's row
 * and the step a run stops at both say it. Foundry's updater cannot when the server was started with in-place updates
 * switched off, nor when it would install another build, as it installs only the newest on its channel, nor for a
 * build Foundry installs only by hand.
 */
import type { CoreUpdateState } from '../foundry/setup-game';
import { format, localize } from '../lib/i18n';
import type { CoreTargetState } from './setup-state.svelte';

/**
 * Why updating in place to a build is refused.
 * @param version - The build the plan chose
 * @param core - Whether Foundry can update itself in place, and its channel
 * @param target - The build Foundry's updater would install, as far as it is known
 * @returns Why, in words; none if it can be updated in place, or while Foundry is yet to say which build it would install
 */
export function coreRefusal(version: string, core: CoreUpdateState, target: CoreTargetState): string | undefined {
  if (!core.canUpdate) return localize('Core.NoUpdateMode');
  if (target === null || target === 'checking') return undefined;
  if (target === 'failed') return localize('Core.CheckFailed');
  if ('none' in target) return format('Core.NoTarget', { message: target.none });
  if (target.version !== version) {
    return format('Core.OtherTarget', { target: target.version, version, channel: core.channel });
  }
  return target.manual ? format('Core.Manual', { version }) : undefined;
}
