/**
 * Local augmentations of the Foundry VTT types for EMMA - Enhanced Module Manager Application.
 *
 * Declare the module's settings, flags, hooks and public API here by merging into the interfaces of
 * `fvtt-types/configuration` (`SettingConfig`, `FlagConfig`, `ModuleConfig`, `Hooks.HookConfig`).
 * @see https://github.com/League-of-Foundry-Developers/foundry-vtt-types
 */
import type { Obscured } from '@module/lib/obscure';

declare module 'fvtt-types/configuration' {
  /** Everything EMMA runs is started from the `init` hook, so the parts of `game` set up by then can be assumed. */
  interface AssumeHookRan {
    init: never;
  }

  interface SettingConfig {
    'mondarth-emma.disabled': boolean;
    'mondarth-emma.view': 'list' | 'split';
    'mondarth-emma.drawerFields': string[];
    'mondarth-emma.autoRecommended': boolean;
    'mondarth-emma.grouped': boolean;
    'mondarth-emma.versionProxy': string;
    'mondarth-emma.versionProxyKey': string;
    'mondarth-emma.versionProxyMode': string;
  }
}

declare global {
  /**
   * The default version lookup proxy a release is built with, obscured, or `null` for a build without one. Set by
   * Vite's `define` from `scripts/build/default-proxy.ts`; read only through `defaultProxy()`.
   */
  const __EMMA_DEFAULT_PROXY__: { readonly url: Obscured; readonly key: Obscured } | null;
}

export {};
