import { mount, unmount } from 'svelte';

import DrawerFieldsForm from '@component/DrawerFieldsForm.svelte';
import { MODULE_ID } from '@module/lib/constants';
import { localize } from '@module/lib/i18n';
import { log } from '@module/lib/logger';
import { getDrawerFields, setDrawerFields } from '@module/settings';
import type { DrawerField } from '@module/state/drawer-fields.svelte';

/** The key of the settings menu, without the module namespace. */
export const DRAWER_FIELDS_MENU = 'drawerFieldsMenu';

/**
 * The window in which a user chooses the details EMMA's drawers show, opened from Game Settings. As with
 * {@link EmmaApp}, its content is the {@link DrawerFieldsForm} Svelte component, mounted on first render and unmounted
 * on close. Saving closes the window; open drawers follow the change at once.
 */
export class DrawerFieldsConfig extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-fields`,
    classes: [MODULE_ID],
    window: {
      title: 'MONDARTH-EMMA.Settings.Fields.Title',
      icon: 'fa-solid fa-list-check',
    },
    position: { width: 420 },
  };

  /** The mounted form, while the window is open. */
  #component: ReturnType<typeof mount> | null = null;

  /**
   * Nothing to render: the Svelte component owns the content.
   * @returns Nothing
   */
  protected override _renderHTML(): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Mount the form into the window content on first render, with the details shown now.
   * @param _result - The (empty) result of {@link DrawerFieldsConfig._renderHTML}
   * @param content - The window's content element
   */
  protected override _replaceHTML(_result: unknown, content: HTMLElement): void {
    if (this.#component !== null) return;
    this.#component = mount(DrawerFieldsForm, {
      target: content,
      props: { initial: getDrawerFields(), onSave: (fields: DrawerField[]) => this.#save(fields) },
    });
  }

  /**
   * Save the details chosen and close. If saving fails, the user is told and the window stays open.
   * @param fields - The details chosen
   */
  async #save(fields: DrawerField[]): Promise<void> {
    try {
      await setDrawerFields(fields);
    } catch (error) {
      log.error('Unable to save the drawer fields', error);
      ui.notifications?.error(localize('MONDARTH-EMMA.Errors.FieldsFailed'));
      return;
    }
    await this.close();
  }

  /**
   * Unmount the form, releasing its listeners and effects.
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

/**
 * Add the Module details menu to EMMA's section of Game Settings. Every user may open it, since the choice is
 * theirs alone. Call during `init`.
 */
export function registerDrawerFieldsMenu(): void {
  game.settings.registerMenu(MODULE_ID, DRAWER_FIELDS_MENU, {
    name: 'MONDARTH-EMMA.Settings.Fields.Name',
    label: 'MONDARTH-EMMA.Settings.Fields.Label',
    hint: 'MONDARTH-EMMA.Settings.Fields.Hint',
    icon: 'fa-solid fa-list-check',
    type: DrawerFieldsConfig,
    restricted: false,
  });
}
