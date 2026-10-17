/**
 * Local augmentations of the Foundry VTT types for EMMA - Enhanced Module Manager Application.
 *
 * Declare the module's settings, flags, hooks and public API here by merging into the interfaces of
 * `fvtt-types/configuration` (`SettingConfig`, `FlagConfig`, `ModuleConfig`, `Hooks.HookConfig`).
 * @see https://github.com/League-of-Foundry-Developers/foundry-vtt-types
 */
declare module 'fvtt-types/configuration' {
  /** Everything EMMA runs is started from the `init` hook, so the parts of `game` set up by then can be assumed. */
  interface AssumeHookRan {
    init: never;
  }

  interface SettingConfig {
    'mondarth-emma.disabled': boolean;
  }
}

export {};
