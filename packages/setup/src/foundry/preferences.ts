/**
 * The setup screen's settings, kept in the browser's local storage for the Foundry server's address, as the setup
 * screen has no settings of its own that EMMA could use.
 */

/** The key the guard's setting is kept under. */
export const GUARD_KEY = 'mondarth-emma.setup.guard';

/**
 * Whether EMMA guards Foundry's own package buttons. On unless switched off; on also when the storage cannot be read.
 * @returns `true` if the guard is on
 */
export function readGuardOn(): boolean {
  try {
    return localStorage.getItem(GUARD_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Keep whether EMMA guards Foundry's own package buttons. Kept for this visit only if the storage cannot be written.
 * @param on - Whether the guard is on
 */
export function writeGuardOn(on: boolean): void {
  try {
    localStorage.setItem(GUARD_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows and blocked site data refuse storage; the setting then lasts until the page is left.
  }
}
