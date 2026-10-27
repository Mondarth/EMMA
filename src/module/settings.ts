import { MODULE_ID } from '@module/lib/constants';
import { defaultCatalogue } from '@module/lib/default-catalogue';
import type { DefaultCatalogue } from '@module/lib/default-catalogue';
import { defaultProxy } from '@module/lib/default-proxy';
import type { DrawerField } from '@module/state/drawer-fields.svelte';
import { DEFAULT_DRAWER_FIELDS, DRAWER_FIELDS, drawerFields, isDrawerField } from '@module/state/drawer-fields.svelte';
import { setIgnoredModules } from '@module/state/hypothetical-ignored.svelte';

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
  /** Whether this user's list view groups related modules under the modules that relate to them, or lists them flat. */
  grouped: 'grouped',
  /** A CORS proxy that hypothetical mode fetches version data through, as a URL template containing `{url}`. */
  versionProxy: 'versionProxy',
  /** The API key sent to the proxy, kept in the GM's browser only. */
  versionProxyKey: 'versionProxyKey',
  /** Which proxy hypothetical mode looks versions up through: EMMA's, the GM's own, or none. */
  versionProxyMode: 'versionProxyMode',
  /** The IDs of the modules hypothetical mode ignores, shared by the world's GMs. */
  hypotheticalIgnored: 'hypotheticalIgnored',
} as const;

/** Which proxy hypothetical mode looks versions up through: EMMA's own (the default), the GM's own, or none. */
export type ProxyMode = 'default' | 'own' | 'none';

const PROXY_MODES: readonly string[] = ['default', 'own', 'none'] satisfies ProxyMode[];

/** Where a proxy URL template puts the URL it fetches. */
export const PROXY_PLACEHOLDER = '{url}';

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

  game.settings.register(MODULE_ID, SETTINGS.grouped, {
    scope: 'user',
    config: false,
    type: Boolean,
    default: true,
  });

  // Both are set in the GM-only Version lookup proxy menu. The key is a client setting, kept in the browser it is
  // entered in: every world and user setting is sent to every user who joins, so any player could read it.
  game.settings.register(MODULE_ID, SETTINGS.versionProxy, {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.versionProxyKey, {
    scope: 'client',
    config: false,
    type: String,
    default: '',
  });

  // Blank until a GM chooses, so that a world which set its own proxy before there was a choice keeps it.
  game.settings.register(MODULE_ID, SETTINGS.versionProxyMode, {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.hypotheticalIgnored, {
    scope: 'world',
    config: false,
    type: Array,
    default: [],
    // Every GM's open window follows the change, wherever it was made.
    onChange: value => {
      setIgnoredModules(toModuleIds(value));
    },
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
 * Register the settings only GMs are offered, as only they change which modules are active. Call during `setup`: the
 * user is not known before it, so a setting registered during `init` cannot be shown to GMs alone.
 */
export function registerGmSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.autoRecommended, {
    name: 'MONDARTH-EMMA.Settings.AutoRecommended.Name',
    hint: 'MONDARTH-EMMA.Settings.AutoRecommended.Hint',
    scope: 'user',
    config: game.user?.isGM === true,
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

/**
 * Whether the current user's list view groups related modules, saved per user so it follows them between devices.
 * @returns `true` to group them, the default; `false` for a flat list
 */
export function isGrouped(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.grouped);
}

/**
 * Remember whether the current user's list view groups related modules.
 * @param grouped - `true` to group them, `false` for a flat list
 */
export async function setGrouped(grouped: boolean): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.grouped, grouped);
}

/**
 * The CORS proxy the GM has set for hypothetical mode to fetch version data through.
 * @returns The URL template, containing {@link PROXY_PLACEHOLDER}; `null` if none is set, or the value set has no
 *   placeholder and so cannot be used
 */
export function getVersionProxy(): string | null {
  const proxy = game.settings.get(MODULE_ID, SETTINGS.versionProxy).trim();
  return proxy.includes(PROXY_PLACEHOLDER) ? proxy : null;
}

/**
 * The API key the GM has set for the version lookup proxy, in this browser.
 * @returns The key, trimmed; `null` if none is set
 */
export function getVersionProxyKey(): string | null {
  const key = game.settings.get(MODULE_ID, SETTINGS.versionProxyKey).trim();
  return key === '' ? null : key;
}

/**
 * Which proxy hypothetical mode looks versions up through. Until a GM chooses, it is EMMA's own, unless the world set
 * its own proxy before there was a choice, which it keeps.
 * @returns The proxy chosen
 */
export function getVersionProxyMode(): ProxyMode {
  const mode = game.settings.get(MODULE_ID, SETTINGS.versionProxyMode);
  if (PROXY_MODES.includes(mode)) return mode as ProxyMode;
  return game.settings.get(MODULE_ID, SETTINGS.versionProxy).trim() === '' ? 'default' : 'own';
}

/** Where versions are looked up: the catalogue asked first, if any, and the proxy, with the API key to send it. */
export interface VersionLookup {
  /** The proxy's URL template, or `null` to look up directly. */
  readonly proxy: string | null;
  /** The key to send the proxy, or `null` for none. */
  readonly apiKey: string | null;
  /** EMMA's package catalogue, with its own key, asked before the proxy; `null` for none. */
  readonly catalogue: DefaultCatalogue | null;
}

/**
 * Where versions are looked up: EMMA's catalogue first and then EMMA's proxy, each with EMMA's key for it; the GM's
 * own proxy with their key; or none. EMMA's keys only ever go to EMMA's services, so a proxy a GM sets never receives
 * them, and a GM who chose their own proxy, or none, is never sent to EMMA's catalogue.
 * @param built - EMMA's proxy as this build has it; this build's own unless given
 * @param builtCatalogue - EMMA's catalogue as this build has it; this build's own unless given
 * @returns The catalogue, proxy and key, or nulls to look up directly
 */
export function versionLookup(
  built: Parameters<typeof defaultProxy>[0] = __EMMA_DEFAULT_PROXY__,
  builtCatalogue: Parameters<typeof defaultCatalogue>[0] = __EMMA_DEFAULT_CATALOGUE__,
): VersionLookup {
  switch (getVersionProxyMode()) {
    case 'default': {
      const proxy = defaultProxy(built);
      const catalogue = defaultCatalogue(builtCatalogue);
      return proxy === null
        ? { proxy: null, apiKey: null, catalogue }
        : { proxy: proxy.url, apiKey: proxy.key, catalogue };
    }
    case 'own': {
      const proxy = getVersionProxy();
      return proxy === null
        ? { proxy: null, apiKey: null, catalogue: null }
        : { proxy, apiKey: getVersionProxyKey(), catalogue: null };
    }
    default:
      return { proxy: null, apiKey: null, catalogue: null };
  }
}

/**
 * Remember the proxy chosen, and the GM's own proxy and its API key.
 * @param mode - The proxy chosen
 * @param proxy - The GM's own proxy URL template, or blank for none
 * @param key - The API key for it, kept in this browser only, or blank for none
 */
export async function setVersionProxy(mode: ProxyMode, proxy: string, key: string): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.versionProxyMode, mode);
  await game.settings.set(MODULE_ID, SETTINGS.versionProxy, proxy.trim());
  await game.settings.set(MODULE_ID, SETTINGS.versionProxyKey, key.trim());
}

/**
 * The module IDs a setting holds, leaving out anything else.
 * @param value - The setting's value
 * @returns The IDs
 */
function toModuleIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id !== '') : [];
}

/**
 * The modules hypothetical mode ignores.
 * @returns Their IDs
 */
export function getHypotheticallyIgnored(): string[] {
  return toModuleIds(game.settings.get(MODULE_ID, SETTINGS.hypotheticalIgnored));
}

/**
 * Have hypothetical mode ignore a module, or stop ignoring it.
 * @param id - The module ID
 * @param ignored - `true` to ignore it
 */
export async function setHypotheticallyIgnored(id: string, ignored: boolean): Promise<void> {
  const ids = new Set(getHypotheticallyIgnored());
  if (ignored) ids.add(id);
  else ids.delete(id);
  await game.settings.set(MODULE_ID, SETTINGS.hypotheticalIgnored, [...ids].sort());
}
