import { mount, unmount } from 'svelte';

import VersionProxyForm from '@component/VersionProxyForm.svelte';
import type { DiscardClosingOptions, DiscardQuestion } from '@module/app/confirm-discard';
import { confirmDiscard } from '@module/app/confirm-discard';
import { MODULE_ID } from '@module/lib/constants';
import { defaultProxy } from '@module/lib/default-proxy';
import { localize } from '@module/lib/i18n';
import { log } from '@module/lib/logger';
import type { ProxyMode } from '@module/settings';
import { SETTINGS, getVersionProxyMode, setVersionProxy } from '@module/settings';
import { VersionProxyDraft } from '@module/state/version-proxy.svelte';

/** The key of the settings menu, without the module namespace. */
export const VERSION_PROXY_MENU = 'versionProxyMenu';

/** What to ask before closing the menu with a change not saved. */
const DISCARD: DiscardQuestion = {
  id: `${MODULE_ID}-proxy-discard`,
  title: 'MONDARTH-EMMA.Settings.VersionProxy.Discard.Title',
  body: 'MONDARTH-EMMA.Settings.VersionProxy.Discard.Body',
};

/**
 * Ask before looking versions up through no proxy at all, saying what is lost. Keeping a proxy is the default.
 * @returns `true` if the GM chose no proxy all the same
 */
async function confirmNoProxy(): Promise<boolean> {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    id: `${MODULE_ID}-no-proxy`,
    window: { title: 'MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Title' },
    content: `<p>${localize('MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Body')}</p>`,
    modal: true,
    yes: { label: 'MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Confirm', icon: 'fa-solid fa-ban', default: false },
    no: { label: 'MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Cancel', icon: 'fa-solid fa-route', default: true },
  });
  return confirmed === true;
}

/**
 * The window in which a GM chooses the CORS proxy hypothetical mode looks versions up through: EMMA's own, their own
 * with the API key sent to it, or none, opened from Game Settings. EMMA's own is offered only by a build that has one,
 * and its URL and key are never shown. As with {@link EmmaApp}, its content is a Svelte component, the
 * {@link VersionProxyForm}, mounted on first render and unmounted on close. Saving closes the window. Closing it with a
 * change not saved asks first, unless the caller passes `discard: true`.
 */
export class VersionProxyConfig extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-proxy`,
    classes: [MODULE_ID],
    window: {
      title: 'MONDARTH-EMMA.Settings.VersionProxy.Title',
      icon: 'fa-solid fa-route',
    },
    position: { width: 480 },
  };

  /** The mounted form, while the window is open. */
  #component: ReturnType<typeof mount> | null = null;

  /** The proxy and key being set, while the window is open. */
  #draft: VersionProxyDraft | null = null;

  /** Whether the user is being asked to confirm closing. */
  #confirming = false;

  /** The choice set when the window opened, against which choosing no proxy is confirmed. */
  #initialMode: ProxyMode = 'default';

  /**
   * Nothing to render: the Svelte component owns the content.
   * @returns Nothing
   */
  protected override _renderHTML(): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Mount the form into the window content on first render, with the proxy and key set now.
   * @param _result - The (empty) result of {@link VersionProxyConfig._renderHTML}
   * @param content - The window's content element
   */
  protected override _replaceHTML(_result: unknown, content: HTMLElement): void {
    if (this.#component !== null) return;
    const hasDefault = defaultProxy() !== null;
    const mode = getVersionProxyMode();
    // A build without EMMA's own proxy looks up through none instead.
    this.#initialMode = mode === 'default' && !hasDefault ? 'none' : mode;
    const draft = new VersionProxyDraft(
      this.#initialMode,
      game.settings.get(MODULE_ID, SETTINGS.versionProxy),
      game.settings.get(MODULE_ID, SETTINGS.versionProxyKey),
    );
    this.#draft = draft;
    this.#component = mount(VersionProxyForm, {
      target: content,
      props: {
        draft,
        hasDefault,
        onSave: (chosen: ProxyMode, proxy: string, key: string) => this.#save(chosen, proxy, key),
      },
    });
  }

  /**
   * Save the choice, and the GM's own proxy and key, and close, without asking, since nothing is left to discard.
   * Choosing no proxy, where there was one, is confirmed first; if the GM thinks better of it, nothing is saved and the
   * window stays open. If saving fails, the user is told and the window stays open.
   * @param mode - The proxy chosen
   * @param proxy - The GM's own proxy URL template, or blank for none
   * @param key - The API key for it, or blank for none
   */
  async #save(mode: ProxyMode, proxy: string, key: string): Promise<void> {
    if (mode === 'none' && this.#initialMode !== 'none' && !(await confirmNoProxy())) return;
    try {
      await setVersionProxy(mode, proxy, key);
    } catch (error) {
      log.error('Unable to save the version lookup proxy', error);
      ui.notifications?.error(localize('MONDARTH-EMMA.Errors.ProxyFailed'));
      return;
    }
    await this.close({ discard: true });
  }

  /**
   * Close the window. With the choice changed and not saved, the user is asked first whether to discard it, and the
   * window stays open unless they agree; further attempts to close while they are being asked are ignored.
   * @param options - Options which modify how the window is closed; `discard: true` closes without asking
   * @returns The window, or nothing if it stayed open
   */
  override async close(options: DiscardClosingOptions = {}): Promise<this | undefined> {
    const { discard = false, ...closing } = options;
    if (!discard && this.#draft?.dirty === true) {
      if (this.#confirming) return;
      this.#confirming = true;
      try {
        if (!(await confirmDiscard(DISCARD))) return;
      } finally {
        this.#confirming = false;
      }
    }
    await super.close(closing);
    return this;
  }

  /**
   * Unmount the form, releasing its listeners and effects.
   * @param options - Options passed to `close`
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    this.#draft = null;
    if (this.#component === null) return;
    void unmount(this.#component);
    this.#component = null;
  }
}

/**
 * Add the Version lookup proxy menu to EMMA's section of Game Settings. Foundry shows a restricted menu only to users
 * who may modify configuration settings: GMs, by default. Call during `init`.
 */
export function registerVersionProxyMenu(): void {
  game.settings.registerMenu(MODULE_ID, VERSION_PROXY_MENU, {
    name: 'MONDARTH-EMMA.Settings.VersionProxy.Name',
    label: 'MONDARTH-EMMA.Settings.VersionProxy.Label',
    hint: 'MONDARTH-EMMA.Settings.VersionProxy.Hint',
    icon: 'fa-solid fa-route',
    type: VersionProxyConfig,
    restricted: true,
  });
}
