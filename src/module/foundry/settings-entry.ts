/**
 * Redirects the Settings sidebar's "Manage Modules" button to EMMA.
 *
 * FRAGILE: Foundry offers no public way to replace the Module Management window. The button runs the Settings tab's
 * private `openApp` action (`Settings.#onOpenApp`, which switches on the button's `data-app`). Rather than patch that
 * private handler, this listens for clicks on the Settings tab's element in the capture phase, which runs before
 * ApplicationV2's own click delegation on the same element, and stops the event there. It depends only on the
 * button's markup (`data-action="openApp" data-app="modules"`, Foundry 14.368), which the end-to-end tests check.
 */
import { openEmma } from '@module/app/emma-app';
import { log } from '@module/lib/logger';
import { localize } from '@module/lib/i18n';
import { isEmmaDisabled } from '@module/settings';

/** The Settings sidebar button that opens Module Management. */
export const MODULES_BUTTON = '[data-action="openApp"][data-app="modules"]';

/** Settings tab elements already listened to. Renders reuse the element, so each needs one listener only. */
const intercepted = new WeakSet<HTMLElement>();

/**
 * Open Foundry's own Module Management window.
 */
function openNativeModuleManagement(): void {
  void new foundry.applications.sidebar.apps.ModuleManagement().render({ force: true });
}

/**
 * Open EMMA in place of Module Management. If EMMA fails to open, the user is told and gets Foundry's own window, so
 * that a broken EMMA never locks them out of managing modules.
 */
async function openInstead(): Promise<void> {
  try {
    await openEmma();
  } catch (error) {
    log.error('Unable to open EMMA; falling back to Module Management', error);
    ui.notifications?.error(localize('MONDARTH-EMMA.Errors.OpenFailed'));
    openNativeModuleManagement();
  }
}

/**
 * Handle a click anywhere in the Settings tab, taking over those on the Module Management button.
 * @param event - The click
 */
function onClick(event: MouseEvent): void {
  if (!(event.target instanceof Element) || event.target.closest(MODULES_BUTTON) === null) return;
  if (isEmmaDisabled()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  log.debug('Opening EMMA in place of Module Management');
  void openInstead();
}

/**
 * Start redirecting the Module Management button to EMMA, in the sidebar and in any popped-out Settings tab.
 * @returns The ID of the `renderSettings` hook, for `Hooks.off`
 */
export function registerModuleManagementOverride(): number {
  return Hooks.on('renderSettings', (_app, element) => {
    if (intercepted.has(element)) return;
    intercepted.add(element);
    element.addEventListener('click', onClick, { capture: true });
  });
}
