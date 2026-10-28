/**
 * Runs a task before the user leaves the world by Foundry's own ways out: **Log Out** and **Return to Setup**.
 *
 * FRAGILE: Foundry fires no hook before either. The main menu and the Settings sidebar call the public
 * `Game#logOut` and `Game#shutDown` (Foundry 14.368), so those are wrapped with libWrapper, and the task runs before
 * them. Closing the browser tab, losing the connection, or stopping the server is not seen.
 */
import { MODULE_ID } from '@module/lib/constants';
import { log } from '@module/lib/logger';

/** How long leaving may wait for the task, so a task that hangs never keeps the user in the world. */
export const EXIT_TIMEOUT_MS = 5_000;

/** The methods wrapped, as libWrapper targets. */
export const EXIT_TARGETS = ['foundry.Game.prototype.logOut', 'foundry.Game.prototype.shutDown'] as const;

/**
 * Run a task, giving up waiting after {@link EXIT_TIMEOUT_MS}. A failure is logged, never thrown.
 * @param task - The task
 * @returns Once the task has finished, failed, or run out of time
 */
async function settle(task: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(() => {
      log.warn('Leaving the world without waiting any longer for the work to finish');
      resolve();
    }, EXIT_TIMEOUT_MS);
  });
  try {
    await Promise.race([task(), timeout]);
  } catch (error) {
    log.error('Unable to finish the work before leaving the world', error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a task each time the user logs out or returns to setup, before Foundry does so. Each wrapper always goes on to
 * Foundry's own method, once the task is done.
 * @param task - The task
 */
export function beforeLeavingWorld(task: () => Promise<unknown>): void {
  for (const target of EXIT_TARGETS) {
    libWrapper.register(
      MODULE_ID,
      target,
      async function (this: unknown, wrapped, ...args) {
        await settle(task);
        return wrapped.apply(this, args);
      },
      'WRAPPER',
    );
  }
}
