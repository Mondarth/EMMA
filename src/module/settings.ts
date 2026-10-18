import { MODULE_ID } from '@module/lib/constants';
import type { DrawerField } from '@module/state/drawer-fields.svelte';
import { DEFAULT_DRAWER_FIELDS, DRAWER_FIELDS, drawerFields, isDrawerField } from '@module/state/drawer-fields.svelte';

/** Keys of the settings EMMA registers, without the module namespace. */
export const SETTINGS = {
  /** When `true`, the Settings sidebar opens Foundry's own Module Management window instead of EMMA. */
  disabled: 'disabled',
  /** The view EMMA last showed this user: one list of every module, or inactive and active modules side by side. */
  view: 'view',
  /** The details this user has chosen to show in module drawers. */
  drawerFields: 'drawerFields',
  /** Whether activating a module also activates the modules it recommends, and deactivating it deactivates them. */
  autoRecommended: 'autoRecommended',
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

  game.settings.register(MODULE_ID, SETTINGS.autoRecommended, {
    name: 'MONDARTH-EMMA.Settings.AutoRecommended.Name',
    hint: 'MONDARTH-EMMA.Settings.AutoRecommended.Hint',
    scope: 'user',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTINGS.drawerFields, {
    scope: 'user',
    config: false,
    type: Array,
    default: [...DEFAULT_DRAWER_FIELDS],
    // Open drawers follow the change, whether it was made here or on another of the user's devices.
    onChange: value => {
      drawerFields.set(toDrawerFields(value));
    },
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
 * Whether the current user has chosen to have recommended modules activated and deactivated with the modules that
 * recommend them. Read on every use, so a change takes effect at once.
 * @returns `true` if recommended modules follow the modules that recommend them
 */
export function isAutoRecommended(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.autoRecommended);
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

/**
 * Read a saved list of drawer fields, dropping anything that is not a field, as a later version might have saved.
 * @param value - The saved value
 * @returns The fields, or {@link DEFAULT_DRAWER_FIELDS} if the value is not a list
 */
function toDrawerFields(value: unknown): DrawerField[] {
  return Array.isArray(value) ? value.filter(isDrawerField) : [...DEFAULT_DRAWER_FIELDS];
}

/**
 * The details the current user has chosen to show in module drawers.
 * @returns The fields, in drawer order
 */
export function getDrawerFields(): DrawerField[] {
  const saved = new Set(toDrawerFields(game.settings.get(MODULE_ID, SETTINGS.drawerFields)));
  return DRAWER_FIELDS.filter(field => saved.has(field));
}

/**
 * Remember the details the current user has chosen to show in module drawers.
 * @param fields - The fields
 */
export async function setDrawerFields(fields: Iterable<DrawerField>): Promise<void> {
  const chosen = new Set(fields);
  await game.settings.set(
    MODULE_ID,
    SETTINGS.drawerFields,
    DRAWER_FIELDS.filter(field => chosen.has(field)),
  );
}
