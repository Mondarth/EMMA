import { MODULE_ID } from '@module/lib/constants';

/** Keys of the settings EMMA registers, without the module namespace. */
export const SETTINGS = {
  /** When `true`, the Settings sidebar opens Foundry's own Module Management window instead of EMMA. */
  disabled: 'disabled',
} as const;

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
}

/**
 * Whether the GM has switched EMMA off in favour of Foundry's own Module Management window. Read on every use, so a
 * change takes effect without reloading.
 * @returns `true` if EMMA is disabled
 */
export function isEmmaDisabled(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.disabled);
}
