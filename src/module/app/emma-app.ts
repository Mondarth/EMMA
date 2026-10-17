import { mount, unmount } from 'svelte';

import EmmaRoot from '@component/EmmaRoot.svelte';
import { MODULE_ID } from '@module/lib/constants';

/**
 * The EMMA window: an `ApplicationV2` frame whose content is rendered entirely by the {@link EmmaRoot} Svelte
 * component. Handlebars is not used, so `_renderHTML` produces nothing and `_replaceHTML` mounts the component the
 * first time the window opens. The component is unmounted when the window closes, and mounted afresh if it reopens.
 */
export class EmmaApp extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    classes: [MODULE_ID],
    window: {
      title: 'MONDARTH-EMMA.App.Title',
      icon: 'fa-solid fa-cubes',
      resizable: true,
    },
    position: { width: 720, height: 640 },
  };

  /** The mounted root component, while the window is open. */
  #component: ReturnType<typeof mount> | null = null;

  /**
   * Whether the Svelte component is currently mounted.
   * @returns `true` while the window shows the component
   */
  get mounted(): boolean {
    return this.#component !== null;
  }

  /**
   * Nothing to render: the Svelte component owns the content and updates itself.
   * @returns Nothing
   */
  protected override _renderHTML(): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Mount the Svelte component into the window content on first render. Later renders leave it in place.
   * @param _result - The (empty) result of {@link EmmaApp._renderHTML}
   * @param content - The window's content element
   */
  protected override _replaceHTML(_result: unknown, content: HTMLElement): void {
    this.#component ??= mount(EmmaRoot, { target: content });
  }

  /**
   * Unmount the Svelte component, releasing its listeners and effects.
   * @param options - Options passed to `close`
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    if (this.#component === null) return;
    void unmount(this.#component);
    this.#component = null;
  }
}

let instance: EmmaApp | null = null;

/**
 * Open the EMMA window, or bring it to the front if it is already open. There is only ever one window.
 * @returns The EMMA window
 */
export async function openEmma(): Promise<EmmaApp> {
  instance ??= new EmmaApp();
  if (instance.rendered) instance.bringToFront();
  else await instance.render({ force: true });
  return instance;
}
