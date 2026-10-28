/**
 * Keeps Foundry's own package installs and updates off the setup screen while EMMA manages packages there, so that
 * nothing changes behind EMMA's back.
 *
 * FRAGILE: Foundry offers no public way to do this, and libWrapper, a module, is not loaded on the setup screen. So:
 * - clicks on the **Install**, **Update** and **Update All** buttons are stopped in the capture phase, before Foundry's
 *   own handlers on the same page run. This depends on the buttons' `data-action` (Foundry 14.368);
 * - as a backstop for any other way in, `game.post`, which sends every installation to the server (as
 *   `{ action: "installPackage" }`), is wrapped and refuses it.
 * Uninstalling, creating worlds and launching them are left alone.
 */
import type { SetupGame, SetupRequest } from './setup-game';

/** The `data-action` of each button guarded: Install, a package's Update, and Update All. */
export const GUARDED_BUTTONS = ['installPackage', 'updatePackage', 'updateAll'] as const;

/** The requests to the server refused: installing a package, which updating one does too. */
export const GUARDED_REQUESTS: readonly unknown[] = ['installPackage'];

/** The class on `<body>` while the guard is on, which greys out the guarded buttons. */
export const GUARDED_CLASS = 'mondarth-emma-guarded';

/** The selector of the guarded buttons. */
const BUTTONS = GUARDED_BUTTONS.map(action => `[data-action="${action}"]`).join(', ');

/** Greys out the guarded buttons while the guard is on. */
const STYLE = `body.${GUARDED_CLASS} :is(${BUTTONS}) { opacity: 0.4; cursor: not-allowed; }`;

/** How the guard is controlled. */
export interface GuardOptions {
  /** Whether the guard is on now; checked on every click and request, so it can be switched at any time. */
  readonly isOn: () => boolean;
  /** Called each time something is refused, to tell the user why. */
  readonly onRefused: () => void;
}

/** A guard in place. */
export interface Guard {
  /** Show whether the guard is on, greying the guarded buttons out or not. Call it after switching the guard. */
  refresh(): void;
  /** Remove the guard, giving Foundry its buttons and requests back. */
  remove(): void;
}

/**
 * Put the guard in place on the setup screen.
 * @param game - The setup screen's `game`
 * @param options - How the guard is controlled
 * @returns The guard
 */
export function installGuard(game: SetupGame, options: GuardOptions): Guard {
  const { isOn, onRefused } = options;
  const onClick = (event: MouseEvent): void => {
    if (!isOn() || !(event.target instanceof Element) || event.target.closest(BUTTONS) === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onRefused();
  };
  document.addEventListener('click', onClick, { capture: true });

  const post = game.post;
  game.post = (request: SetupRequest, postOptions?: object): Promise<unknown> => {
    if (isOn() && GUARDED_REQUESTS.includes(request.action)) {
      onRefused();
      // Foundry's installer reports an `error` in the answer as a failed installation.
      return Promise.resolve({ error: 'EMMA manages packages on this screen' });
    }
    return post.call(game, request, postOptions);
  };

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const refresh = (): void => {
    document.body.classList.toggle(GUARDED_CLASS, isOn());
  };
  refresh();

  return {
    refresh,
    remove() {
      document.removeEventListener('click', onClick, { capture: true });
      game.post = post;
      style.remove();
      document.body.classList.remove(GUARDED_CLASS);
    },
  };
}
