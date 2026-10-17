import { MODULE_ID } from '@module/lib/constants';

/** Keys of the settings EMMA registers, without the module namespace. */
export const SETTINGS = {
  /** When `true`, the Settings sidebar opens Foundry's own Module Management window instead of EMMA. */
  disabled: 'disabled',
  /** The view EMMA last showed this user: one list of every module, or inactive and active modules side by side. */
  view: 'view',
} as const;

/** EMMA's main views. */
export type View = 'list' | 'split';

/** The view shown until a user chooses one. */
export const DEFAULT_VIEW: View = 'list';

/**
 * Register EMMA's settings. Call during `init`.
 */
export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.disabled, {
    name: 'MONDARTH-EMMA.Settings.Disabled.Name',
    hint: 'MONDARTH-EMMA.Settings.Disabled.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTINGS.view, {
    scope: 'user',
    config: false,
    type: String,
    choices: { list: 'MONDARTH-EMMA.Toolbar.List', split: 'MONDARTH-EMMA.Toolbar.Split' },
    default: DEFAULT_VIEW,
  });
}

/**
 * Whether the GM has switched EMMA off in favour of Foundry's own Module Management window. Read on every use, so a
 * change takes effect without reloading.
 * @returns `true` if EMMA is disabled
 */
export function isEmmaDisabled(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.disabled);
}

/**
 * The view EMMA last showed the current user, saved per user so it follows them between devices.
 * @returns The view, or {@link DEFAULT_VIEW} if none was saved or the saved value is not a view
 */
export function getView(): View {
  const view: unknown = game.settings.get(MODULE_ID, SETTINGS.view);
  return view === 'split' || view === 'list' ? view : DEFAULT_VIEW;
}

/**
 * Remember the view the current user chose.
 * @param view - The view
 */
export async function setView(view: View): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.view, view);
}
