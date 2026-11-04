/**
 * Keeps Foundry's own package installs, updates, uninstalls and locks off the setup screen while EMMA manages packages
 * there, so that nothing changes behind EMMA's back.
 *
 * FRAGILE: Foundry offers no public way to do this, and libWrapper, a module, is not loaded on the setup screen. So, as
 * checked on Foundry 14.368:
 * - clicks on the **Install**, **Update** and **Update All** buttons are stopped in the capture phase, before Foundry's
 *   own handlers on the same page run. This depends on the buttons' `data-action`;
 * - so are clicks on **Lock** and **Unlock** in the package menu of a game system or module. The menu marks them by
 *   their icons alone, `fa-lock` and `fa-unlock`, and opens on a right-click on a `.package` within the list of its
 *   type, `[data-package-type]`, which is noted as it opens;
 * - `game.uninstallPackage`, which the package menu's **Uninstall** calls, is wrapped and refuses a game system or
 *   module before Foundry asks the user to confirm;
 * - as a backstop for any other way in, `game.post`, which sends each of these to the server, is wrapped and refuses
 *   installing a package (`{ action: "installPackage" }`), and uninstalling, locking or unlocking a game system or
 *   module (`uninstallPackage`, `lockPackage`).
 * Worlds are left alone: uninstalling, locking, creating and launching them; and so is what EMMA does itself, while it
 * does it (see {@link Guard.allowing}).
 */
import type { SetupGame, SetupRequest } from './setup-game';

/** The `data-action` of each button guarded: Install, a package's Update, and Update All. */
export const GUARDED_BUTTONS = ['installPackage', 'updatePackage', 'updateAll'] as const;

/** The requests to the server refused: installing a package, which updating one does too. */
export const GUARDED_REQUESTS: readonly unknown[] = ['installPackage'];

/** The requests to the server refused for a game system or module: uninstalling it, and locking or unlocking it. */
export const GUARDED_PACKAGE_REQUESTS: readonly unknown[] = ['uninstallPackage', 'lockPackage'];

/** Why a refused install, uninstall or lock fails. */
export const REFUSAL = 'EMMA manages packages on this screen';

/**
 * Whether a package's type is one EMMA manages.
 * @param type - The type, as Foundry gives it
 * @returns `true` for a game system or module
 */
const managed = (type: unknown): boolean => type === 'module' || type === 'system';

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
  /**
   * Let requests through while EMMA installs something itself, as the EMMA module, and its dependencies, which
   * Foundry asks to install after it.
   * @param run - What EMMA does meanwhile
   * @returns What it gives, once done
   */
  allowing<T>(run: () => Promise<T>): Promise<T>;
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
  // How many of EMMA's own installs are going on.
  let allowed = 0;
  // The type of package the package menu last opened for.
  let menuFor: string | undefined;
  const onContextMenu = (event: MouseEvent): void => {
    const pkg = event.target instanceof Element ? event.target.closest('.package') : null;
    menuFor = pkg?.closest('[data-package-type]')?.getAttribute('data-package-type') ?? undefined;
  };
  const isLockItem = (target: Element): boolean =>
    managed(menuFor) && (target.closest('.context-item')?.querySelector('.fa-lock, .fa-unlock') ?? null) !== null;
  const onClick = (event: MouseEvent): void => {
    if (!isOn() || allowed > 0 || !(event.target instanceof Element)) return;
    if (event.target.closest(BUTTONS) === null && !isLockItem(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onRefused();
  };
  document.addEventListener('contextmenu', onContextMenu, { capture: true });
  document.addEventListener('click', onClick, { capture: true });

  const uninstall = game.uninstallPackage;
  if (uninstall !== undefined) {
    game.uninstallPackage = pkg => {
      if (isOn() && allowed === 0 && managed(pkg.type)) {
        onRefused();
        return Promise.resolve();
      }
      return uninstall.call(game, pkg);
    };
  }

  const post = game.post;
  game.post = (request: SetupRequest, postOptions?: object): Promise<unknown> => {
    if (isOn() && allowed === 0 && GUARDED_REQUESTS.includes(request.action)) {
      onRefused();
      // Foundry's installer reports an `error` in the answer as a failed installation.
      return Promise.resolve({ error: REFUSAL });
    }
    if (isOn() && allowed === 0 && GUARDED_PACKAGE_REQUESTS.includes(request.action) && managed(request.type)) {
      onRefused();
      // Foundry takes its own steps after an uninstall or lock the server answers, but not after one that fails.
      return Promise.reject(new Error(REFUSAL));
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
    async allowing(run) {
      allowed++;
      try {
        return await run();
      } finally {
        allowed--;
      }
    },
    remove() {
      document.removeEventListener('contextmenu', onContextMenu, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
      game.post = post;
      if (uninstall !== undefined) game.uninstallPackage = uninstall;
      style.remove();
      document.body.classList.remove(GUARDED_CLASS);
    },
  };
}
