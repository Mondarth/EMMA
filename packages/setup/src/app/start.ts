/**
 * Starts EMMA on the setup screen, once Foundry has set the screen up: the guard on Foundry's own package buttons, and
 * EMMA's button in the menu. On any other page it does nothing, so it is safe to inject anywhere.
 */
import type { Guard } from '../foundry/guard';
import { installGuard } from '../foundry/guard';
import { keepMenuButton } from '../foundry/menu-button';
import { readGuardOn, writeGuardOn } from '../foundry/preferences';
import { readRecords } from '../foundry/records';
import type { SetupGame } from '../foundry/setup-game';
import { readInstallation, setupGame } from '../foundry/setup-game';
import { localize } from '../lib/i18n';
import { buildOverview } from '../lib/overview';
import { openEmmaSetup } from './emma-setup-app';
import { SetupState } from './setup-state.svelte';

/** Marks the page once EMMA has started on it, so that a second injection does nothing. */
const STARTED = Symbol.for('mondarth-emma.setup');

/** How long to wait for Foundry to set the setup screen up, and how often to look. */
export interface WaitOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

/**
 * Wait for Foundry to set the setup screen up.
 * @param options - How long to wait, and how often to look
 * @returns The setup screen's `game`, or `undefined` if this is not the setup screen
 */
export async function waitForSetup(options: WaitOptions = {}): Promise<SetupGame | undefined> {
  const { timeoutMs = 30_000, intervalMs = 250 } = options;
  const until = Date.now() + timeoutMs;
  for (;;) {
    const game = setupGame();
    if (game !== undefined || Date.now() >= until) return game;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Start EMMA on this page, if it is Foundry's setup screen and EMMA has not started on it already.
 * @param options - How long to wait for Foundry to set the screen up
 * @returns `true` if EMMA started
 */
export async function startEmmaSetup(options: WaitOptions = {}): Promise<boolean> {
  if (Reflect.get(globalThis, STARTED) === true) return false;
  Reflect.set(globalThis, STARTED, true);

  const game = await waitForSetup(options);
  if (game === undefined) {
    Reflect.deleteProperty(globalThis, STARTED);
    return false;
  }

  // The guard follows the state's setting, and the state tells the guard when it changes.
  const placed: { guard?: Guard } = {};
  const setup = new SetupState({
    load: async () => {
      const installation = readInstallation(game);
      return buildOverview(installation, await readRecords(installation.worlds.map(({ id }) => id)));
    },
    guardOn: readGuardOn(),
    onGuardChange: on => {
      writeGuardOn(on);
      placed.guard?.refresh();
    },
  });
  placed.guard = installGuard(game, {
    isOn: () => setup.guardOn,
    onRefused: () => {
      ui.notifications?.info(localize('Refused'));
    },
  });
  keepMenuButton({
    label: localize('Button'),
    onClick: () => {
      void openEmmaSetup(setup);
    },
  });
  return true;
}
