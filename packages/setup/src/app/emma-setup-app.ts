/**
 * EMMA's window on the setup screen: an `ApplicationV2` frame, as Foundry's own windows there are, whose content is
 * rendered entirely by the {@link SetupRoot} Svelte component. The component is mounted when the window first renders
 * and unmounted when it closes.
 */
import { mount, unmount } from 'svelte';

import SetupRoot from '../component/SetupRoot.svelte';
import { localize } from '../lib/i18n';
import type { SetupState } from './setup-state.svelte';

/** The window's ID, also its element's. */
export const APP_ID = 'mondarth-emma-setup';

/** The EMMA window on the setup screen. */
export class EmmaSetupApp extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: [APP_ID],
    window: { title: localize('App.Title'), icon: 'fa-solid fa-cubes', resizable: true },
    position: { width: 820, height: 600 },
  };

  /** What the window shows. */
  readonly setup: SetupState;

  /** The mounted root component, while the window is open. */
  #component: ReturnType<typeof mount> | null = null;

  /**
   * @param setup - What the window shows
   */
  constructor(setup: SetupState) {
    super();
    this.setup = setup;
  }

  /**
   * Nothing to render: the Svelte component owns the content and updates itself.
   * @returns Nothing
   */
  protected override _renderHTML(): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Mount the Svelte component on first render, and read the installation afresh. Later renders leave it in place.
   * @param _result - The (empty) result of {@link EmmaSetupApp._renderHTML}
   * @param content - The window's content element
   */
  protected override _replaceHTML(_result: unknown, content: HTMLElement): void {
    if (this.#component !== null) return;
    this.#component = mount(SetupRoot, { target: content, props: { setup: this.setup } });
    void this.setup.refresh();
  }

  /**
   * Unmount the Svelte component as the window closes.
   * @param options - Foundry's close options
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    if (this.#component !== null) await unmount(this.#component);
    this.#component = null;
  }
}

/** The window, while it is open. */
let openApp: EmmaSetupApp | null = null;

/**
 * Open the window, or bring it to the front if it is open.
 * @param setup - What the window shows
 * @returns The window
 */
export async function openEmmaSetup(setup: SetupState): Promise<EmmaSetupApp> {
  if (openApp?.rendered === true) {
    openApp.bringToFront();
    return openApp;
  }
  openApp = new EmmaSetupApp(setup);
  await openApp.render({ force: true });
  return openApp;
}

/**
 * Close the window, if it is open.
 * @returns Once it has closed
 */
export async function closeEmmaSetup(): Promise<void> {
  const closing = openApp;
  openApp = null;
  await closing?.close();
}
