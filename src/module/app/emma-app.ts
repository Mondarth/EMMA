import { mount, unmount } from 'svelte';

import EmmaRoot from '@component/EmmaRoot.svelte';
import { canManageModules, listInstalledModules, readActivation } from '@module/adapters/modules';
import { isGM, readPlatform } from '@module/adapters/platform';
import { createVersionJudge } from '@module/adapters/versions';
import type { SetupReportData } from '@module/app/setup-report';
import { closeSetupReport, showSetupReport } from '@module/app/setup-report';
import type { DiscardClosingOptions, DiscardQuestion } from '@module/app/confirm-discard';
import { confirmDiscard } from '@module/app/confirm-discard';
import { saveModules } from '@module/app/save';
import { MODULE_ID } from '@module/lib/constants';
import { log } from '@module/lib/logger';
import type { View } from '@module/settings';
import { localize } from '@module/lib/i18n';
import {
  getDrawerFields,
  getHypotheticallyIgnored,
  getView,
  isAutoRecommended,
  isGrouped,
  setGrouped,
  setHypotheticallyIgnored,
  setView,
  versionLookup,
} from '@module/settings';
import { drawerFields } from '@module/state/drawer-fields.svelte';
import { ignoredModules, setIgnoredModules } from '@module/state/hypothetical-ignored.svelte';
import { ModuleState } from '@module/state/module-state.svelte';

/** What to ask before closing EMMA with changes staged. */
const DISCARD: DiscardQuestion = {
  id: `${MODULE_ID}-discard`,
  title: 'MONDARTH-EMMA.Discard.Title',
  body: 'MONDARTH-EMMA.Discard.Body',
};

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
      icon: 'fa-solid fa-cube',
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
    const modules = new ModuleState(listInstalledModules(), readActivation(), { autoRecommended: isAutoRecommended });
    this.#modules = modules;
    drawerFields.set(getDrawerFields());
    setIgnoredModules(getHypotheticallyIgnored());
    this.#component = mount(EmmaRoot, {
      target: content,
      props: {
        modules,
        initialView: getView(),
        initialGrouped: isGrouped(),
        canManage: canManageModules(),
        platform: isGM() ? readPlatform() : undefined,
        // The proxy and its key are read when the first lookup starts, so a change made before then is used.
        createVersionJudge: isGM()
          ? () =>
              createVersionJudge({
                ...versionLookup(),
                clientVersion: game.modules.get(MODULE_ID)?.version ?? null,
              })
          : undefined,
        onReport: (report: SetupReportData) => {
          showSetupReport(report).catch((error: unknown) => {
            log.error('Unable to show the setup report', error);
          });
        },
        fields: drawerFields,
        onSave: () => saveModules(modules),
        onViewChange: (view: View) => {
          setView(view).catch((error: unknown) => {
            log.error('Unable to remember the view', error);
          });
        },
        onGroupedChange: (grouped: boolean) => {
          setGrouped(grouped).catch((error: unknown) => {
            log.error('Unable to remember the grouping', error);
          });
        },
      },
    });
    if (isGM()) attachIgnoreMenu(content);
  }

  /**
   * Close the window. With changes staged, the user is asked first whether to discard them, and the window stays open
   * unless they agree; further attempts to close while they are being asked are ignored.
   * @param options - Options which modify how the window is closed; `discard: true` closes without asking
   * @returns The window, or nothing if it stayed open
   */
  override async close(options: EmmaApp.ClosingOptions = {}): Promise<this | undefined> {
    const { discard = false, ...closing } = options;
    // In hypothetical mode, only what was staged before it was entered is the user's to lose.
    const unsaved =
      this.#modules?.hypothetical === true ? this.#modules.stagedBeforeHypothetical : this.#modules?.dirty;
    if (!discard && unsaved === true) {
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
   * Unmount the Svelte component, releasing its listeners and effects.
   * @param options - Options passed to `close`
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    this.#modules = null;
    // The report's update would apply to a hypothetical setup that has gone.
    await closeSetupReport();
    if (this.#component === null) return;
    void unmount(this.#component);
    this.#component = null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- Declaration merging gives the options type a home next to the class, as Foundry's types do.
export declare namespace EmmaApp {
  /** Options for {@link EmmaApp.close}. */
  type ClosingOptions = DiscardClosingOptions;
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

/**
 * The module a context menu was opened on.
 * @param target - The module's row
 * @returns Its ID
 */
function moduleIdOf(target: HTMLElement): string {
  return target.dataset['moduleId'] ?? '';
}

/**
 * Have hypothetical mode ignore a module, or stop ignoring it, saying so if that cannot be saved.
 * @param id - The module ID
 * @param ignored - `true` to ignore it
 */
function setIgnored(id: string, ignored: boolean): void {
  setHypotheticallyIgnored(id, ignored).catch((error: unknown) => {
    log.error('Unable to save which modules hypothetical mode ignores', error);
    ui.notifications?.error(localize('MONDARTH-EMMA.Errors.IgnoreFailed'));
  });
}

/**
 * Give each module's row a context menu, opened with a right click, to have hypothetical mode ignore the module, or
 * stop ignoring it. The menu listens on the content, so it serves the rows the views render as they change. Only GMs
 * have hypothetical mode, and only they may change a world setting.
 * @param content - The window's content element
 */
function attachIgnoreMenu(content: HTMLElement): void {
  new foundry.applications.ux.ContextMenu(
    content,
    '[data-module-id]',
    [
      {
        label: 'MONDARTH-EMMA.Ignore.Add',
        icon: '<i class="fa-solid fa-flask-vial"></i>',
        visible: target => !ignoredModules.has(moduleIdOf(target)),
        onClick: (_event, target) => {
          setIgnored(moduleIdOf(target), true);
        },
      },
      {
        label: 'MONDARTH-EMMA.Ignore.Remove',
        icon: '<i class="fa-solid fa-flask"></i>',
        visible: target => ignoredModules.has(moduleIdOf(target)),
        onClick: (_event, target) => {
          setIgnored(moduleIdOf(target), false);
        },
      },
    ],
    { jQuery: false, fixed: true },
  );
}
