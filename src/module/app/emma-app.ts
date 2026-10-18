import { mount, unmount } from 'svelte';

import EmmaRoot from '@component/EmmaRoot.svelte';
import { canManageModules, listInstalledModules, readActivation } from '@module/adapters/modules';
import { saveModules } from '@module/app/save';
import { MODULE_ID } from '@module/lib/constants';
import { localize } from '@module/lib/i18n';
import { log } from '@module/lib/logger';
import type { View } from '@module/settings';
import { getDrawerFields, getView, setView } from '@module/settings';
import { drawerFields } from '@module/state/drawer-fields.svelte';
import { ModuleState } from '@module/state/module-state.svelte';

/**
 * The EMMA window: an `ApplicationV2` frame whose content is rendered entirely by the {@link EmmaRoot} Svelte
 * component. Handlebars is not used, so `_renderHTML` produces nothing and `_replaceHTML` mounts the component the
 * first time the window opens. The component is unmounted when the window closes, and mounted afresh if it reopens.
 *
 * Each time the window opens it reads the installed modules and their saved activation into a new
 * {@link ModuleState}, so changes staged and not saved are discarded when the window closes. Closing with staged
 * changes asks first, unless the caller passes `discard: true`.
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

  /** The modules shown, while the window is open. */
  #modules: ModuleState | null = null;

  /** Whether the user is being asked to confirm closing. */
  #confirming = false;

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
   * Mount the Svelte component into the window content on first render, with the modules as they are saved now, the
   * view this user last chose, and whether they may save changes. Later renders leave it in place.
   * @param _result - The (empty) result of {@link EmmaApp._renderHTML}
   * @param content - The window's content element
   */
  protected override _replaceHTML(_result: unknown, content: HTMLElement): void {
    if (this.#component !== null) return;
    const modules = new ModuleState(listInstalledModules(), readActivation());
    this.#modules = modules;
    drawerFields.set(getDrawerFields());
    this.#component = mount(EmmaRoot, {
      target: content,
      props: {
        modules,
        initialView: getView(),
        canManage: canManageModules(),
        fields: drawerFields,
        onSave: () => saveModules(modules),
        onViewChange: (view: View) => {
          setView(view).catch((error: unknown) => {
            log.error('Unable to remember the view', error);
          });
        },
      },
    });
  }

  /**
   * Close the window. With changes staged, the user is asked first whether to discard them, and the window stays open
   * unless they agree; further attempts to close while they are being asked are ignored.
   * @param options - Options which modify how the window is closed; `discard: true` closes without asking
   * @returns The window, or nothing if it stayed open
   */
  override async close(options: EmmaApp.ClosingOptions = {}): Promise<this | undefined> {
    const { discard = false, ...closing } = options;
    if (!discard && this.#modules?.dirty === true) {
      if (this.#confirming) return;
      this.#confirming = true;
      try {
        if (!(await confirmDiscard())) return;
      } finally {
        this.#confirming = false;
      }
    }
    await super.close(closing);
    return this;
  }

  /**
   * Unmount the Svelte component, releasing its listeners and effects.
   * @param options - Options passed to `close`
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    this.#modules = null;
    if (this.#component === null) return;
    void unmount(this.#component);
    this.#component = null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- Declaration merging gives the options type a home next to the class, as Foundry's types do.
export declare namespace EmmaApp {
  /** Options for {@link EmmaApp.close}. */
  interface ClosingOptions extends foundry.applications.api.ApplicationV2.ClosingOptions {
    /** Close without asking, discarding any staged changes. */
    discard?: boolean;
  }
}

/**
 * Ask whether to close EMMA, discarding the changes staged in it. Keeping them is the default.
 * @returns `true` if the user chose to discard the changes
 */
async function confirmDiscard(): Promise<boolean> {
  const discard = await foundry.applications.api.DialogV2.confirm({
    id: `${MODULE_ID}-discard`,
    window: { title: 'MONDARTH-EMMA.Discard.Title' },
    content: `<p>${localize('MONDARTH-EMMA.Discard.Body')}</p>`,
    modal: true,
    yes: { label: 'MONDARTH-EMMA.Discard.Discard', icon: 'fa-solid fa-trash', default: false },
    no: { label: 'MONDARTH-EMMA.Discard.Keep', icon: 'fa-solid fa-pen', default: true },
  });
  return discard === true;
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
