import { MODULE_ID } from '@module/lib/constants';
import { defaultCatalogue } from '@module/lib/default-catalogue';
import type { DefaultCatalogue } from '@module/lib/default-catalogue';
import type { DrawerField } from '@module/state/drawer-fields.svelte';
import { DEFAULT_DRAWER_FIELDS, DRAWER_FIELDS, drawerFields, isDrawerField } from '@module/state/drawer-fields.svelte';
import type { BadgeChecks } from '@module/state/badge-checks.svelte';
import { setBadgeChecks } from '@module/state/badge-checks.svelte';
import { setIgnoredModules, setIgnoredNotes } from '@module/state/hypothetical-ignored.svelte';

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
  /** The IDs of the modules hypothetical mode ignores, shared by the world's GMs. */
  hypotheticalIgnored: 'hypotheticalIgnored',
  /** The GMs' notes on the modules hypothetical mode ignores, by module ID, shared as the modules ignored are. */
  hypotheticalNotes: 'hypotheticalNotes',
  /** Whose checks the badges outside hypothetical mode show: EMMA's, or Foundry's own. */
  badgeChecks: 'badgeChecks',
  /** How many versions before the one installed hypothetical mode offers, and its reports consider. */
  olderVersions: 'olderVersions',
  /** How this GM is told, when a world starts, what changed in its setup since it last ran. */
  startupChanges: 'startupChanges',
} as const;

/** How a GM is told what changed since the world last ran: not at all, in a dialog, in a chat card, or both. */
export type StartupChanges = 'none' | 'dialog' | 'chat' | 'both';

const STARTUP_CHANGES: readonly string[] = ['none', 'dialog', 'chat', 'both'] satisfies StartupChanges[];

/** The most older versions a GM may choose to be shown: more cost more to judge, for little more use. */
export const MAX_OLDER_VERSIONS = 20;

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

  game.settings.register(MODULE_ID, SETTINGS.badgeChecks, {
    name: 'MONDARTH-EMMA.Settings.BadgeChecks.Name',
    hint: 'MONDARTH-EMMA.Settings.BadgeChecks.Hint',
    scope: 'user',
    config: true,
    type: String,
    choices: {
      emma: 'MONDARTH-EMMA.Settings.BadgeChecks.Emma',
      foundry: 'MONDARTH-EMMA.Settings.BadgeChecks.Foundry',
    },
    default: 'emma',
    // An open window's badges follow the change.
    onChange: value => {
      setBadgeChecks(toBadgeChecks(value));
    },
  });

  game.settings.register(MODULE_ID, SETTINGS.grouped, {
    scope: 'user',
    config: false,
    type: Boolean,
    default: true,
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

  game.settings.register(MODULE_ID, SETTINGS.hypotheticalNotes, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    // As for the modules ignored.
    onChange: value => {
      setIgnoredNotes(toNotes(value));
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
 * Register the settings only GMs are offered, as only they change which modules are active and use hypothetical
 * mode. Call during `setup`: the user is not known before it, so a setting registered during `init` cannot be shown to
 * GMs alone.
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

  game.settings.register(MODULE_ID, SETTINGS.olderVersions, {
    name: 'MONDARTH-EMMA.Settings.OlderVersions.Name',
    hint: 'MONDARTH-EMMA.Settings.OlderVersions.Hint',
    scope: 'user',
    config: game.user?.isGM === true,
    type: Number,
    range: { min: 0, max: MAX_OLDER_VERSIONS, step: 1 },
    default: 0,
  });

  game.settings.register(MODULE_ID, SETTINGS.startupChanges, {
    name: 'MONDARTH-EMMA.Settings.StartupChanges.Name',
    hint: 'MONDARTH-EMMA.Settings.StartupChanges.Hint',
    scope: 'user',
    config: game.user?.isGM === true,
    type: String,
    choices: {
      none: 'MONDARTH-EMMA.Settings.StartupChanges.None',
      dialog: 'MONDARTH-EMMA.Settings.StartupChanges.Dialog',
      chat: 'MONDARTH-EMMA.Settings.StartupChanges.Chat',
      both: 'MONDARTH-EMMA.Settings.StartupChanges.Both',
    },
    default: 'dialog',
  });
}

/**
 * How the current user chose to be told, when a world starts, what changed since it last ran.
 * @returns Their choice; a dialog if they made none, or the setting holds something else
 */
export function getStartupChanges(): StartupChanges {
  const chosen = game.settings.get(MODULE_ID, SETTINGS.startupChanges);
  return STARTUP_CHANGES.includes(chosen) ? chosen : 'dialog';
}

/**
 * How many versions before the one installed hypothetical mode offers in each version drop-down, and its reports
 * consider, as the current user chose. Read on every use, so a change takes effect the next time versions are judged.
 * @returns A whole number from 0 to {@link MAX_OLDER_VERSIONS}; 0 if none was chosen
 */
export function getOlderVersions(): number {
  const chosen = game.settings.get(MODULE_ID, SETTINGS.olderVersions);
  return Number.isFinite(chosen) ? Math.min(Math.max(Math.trunc(chosen), 0), MAX_OLDER_VERSIONS) : 0;
}

/**
 * Read a saved choice of checks, taking anything else as EMMA's, the default.
 * @param value - The saved value
 * @returns Whose checks
 */
function toBadgeChecks(value: unknown): BadgeChecks {
  return value === 'foundry' ? 'foundry' : 'emma';
}

/**
 * Whose checks the current user chose the badges outside hypothetical mode to show.
 * @returns `emma`, unless they chose Foundry's own
 */
export function getBadgeChecks(): BadgeChecks {
  return toBadgeChecks(game.settings.get(MODULE_ID, SETTINGS.badgeChecks));
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

/** Where versions are looked up: EMMA's package catalogue, alone. */
export interface VersionLookup {
  /** EMMA's package catalogue, with its key; `null` for none, when only the installed versions are known. */
  readonly catalogue: DefaultCatalogue | null;
}

/**
 * Where versions are looked up: EMMA's catalogue, with EMMA's key for it.
 * @param builtCatalogue - EMMA's catalogue as this build has it; this build's own unless given
 * @returns The catalogue, or `null` for a build without one
 */
export function versionLookup(
  builtCatalogue: Parameters<typeof defaultCatalogue>[0] = __EMMA_DEFAULT_CATALOGUE__,
): VersionLookup {
  return { catalogue: defaultCatalogue(builtCatalogue) };
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
  // A note goes with what it is on.
  if (!ignored) await setHypotheticalNote(id, '');
}

/** The longest a note may be, in characters. */
export const MAX_NOTE_LENGTH = 200;

/**
 * Notes as the setting may hold them: an object of text by module ID, the rest left out.
 * @param value - What the setting holds
 * @returns The notes
 */
function toNotes(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
  );
}

/**
 * The GMs' notes on the modules hypothetical mode ignores.
 * @returns The notes, by module ID
 */
export function getHypotheticalNotes(): Record<string, string> {
  return toNotes(game.settings.get(MODULE_ID, SETTINGS.hypotheticalNotes));
}

/**
 * Keep a note on a module hypothetical mode ignores, without the space around it and no longer than a note may be, or
 * remove it, for empty text. Nothing is written when it is as kept.
 * @param id - The module ID
 * @param text - The note
 */
export async function setHypotheticalNote(id: string, text: string): Promise<void> {
  const notes = getHypotheticalNotes();
  const note = text.trim().slice(0, MAX_NOTE_LENGTH).trim();
  if ((notes[id] ?? '') === note) return;
  const rest = Object.fromEntries(Object.entries(notes).filter(([other]) => other !== id));
  await game.settings.set(MODULE_ID, SETTINGS.hypotheticalNotes, note === '' ? rest : { ...rest, [id]: note });
}
