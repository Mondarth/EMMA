/**
 * The only place EMMA reads or changes which modules are installed and active. Everything else works on the plain
 * values returned here, so the UI and the state store can be tested without Foundry.
 *
 * Activation is read from and written to the world setting `core.moduleConfiguration`, as Foundry's own Module
 * Management window does. A change only takes effect once the world reloads.
 */

/** One of a module's authors, with the ways the manifest gives to reach them. */
export interface ModuleAuthor {
  readonly name: string;
  readonly url?: string;
  readonly email?: string;
  /** A Discord user name, which has no link. */
  readonly discord?: string;
}

/** A language a module is translated into. */
export interface ModuleLanguage {
  /** The language tag, such as `en` or `pt-BR`. */
  readonly lang: string;
  /** The language's name, from the manifest or else in the user's language. */
  readonly name: string;
}

/** How compatible a module is with this Foundry version, as Foundry's own Module Management shows it. */
export interface VersionBadge {
  /** The badge's colour: `success` (verified), `neutral`, `warning` or `error`. */
  readonly type: 'success' | 'warning' | 'neutral' | 'error';
  /** Font Awesome classes for the badge's icon. */
  readonly icon: string;
  /** Foundry's explanation, as HTML for a tooltip; the tooltip manager cleans it before showing it. */
  readonly tooltip: string;
  /** The same explanation as plain text, for screen readers. */
  readonly text: string;
}

/** The Foundry versions a module, or a package it relates to, declares itself compatible with. */
export interface Compatibility {
  readonly minimum?: string;
  readonly verified?: string;
  readonly maximum?: string;
}

/** A package a module relates to: one it requires, recommends or conflicts with, or a game system it supports. */
export interface ModuleRelation {
  readonly id: string;
  readonly type: 'module' | 'system' | 'world';
  /** The package's title if it is installed (or, for a system, in use), else its ID. */
  readonly title: string;
  /** Why the module relates to it, as plain text. */
  readonly reason?: string;
}

/** The packages a module relates to, by relationship, in manifest order. */
export interface ModuleRelationships {
  readonly systems: readonly ModuleRelation[];
  readonly requires: readonly ModuleRelation[];
  readonly recommends: readonly ModuleRelation[];
  readonly conflicts: readonly ModuleRelation[];
}

/** The web pages a manifest can link to. */
export const LINK_KINDS = ['url', 'readme', 'changelog', 'bugs', 'license', 'manifest', 'download'] as const;

/** A web page a manifest links to: its project page, readme, changelog, bug tracker, licence, manifest or download. */
export interface ModuleLink {
  readonly kind: (typeof LINK_KINDS)[number];
  /** An absolute `http` or `https` URL. */
  readonly url: string;
}

/** A compendium pack a module provides. */
export interface ModulePack {
  readonly name: string;
  readonly label: string;
  /** The type of document it holds, such as `Actor`. */
  readonly type: string;
}

/** An installed module, as EMMA shows it. */
export interface ModuleEntry {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  /** The compatibility badge shown with the version, or `null` if Foundry gives none. */
  readonly badge: VersionBadge | null;
  /** The manifest's description: HTML, cleaned by Foundry so it is safe to insert. */
  readonly description: string;
  /** The module's authors, in manifest order. */
  readonly authors: readonly ModuleAuthor[];
  /** The languages the module is translated into, in manifest order. */
  readonly languages: readonly ModuleLanguage[];
  /** The web pages the manifest links to, in {@link LINK_KINDS} order. */
  readonly links: readonly ModuleLink[];
  /** The Foundry versions the module declares itself compatible with. */
  readonly compatibility: Compatibility;
  /** The packages the module relates to. */
  readonly relationships: ModuleRelationships;
  /** The compendium packs the module provides, in manifest order. */
  readonly packs: readonly ModulePack[];
  /** Whether the module is a library, providing nothing itself but for other modules to use. */
  readonly library: boolean;
  /** The IDs of the modules this one requires, which must be active whenever it is. */
  readonly requires: readonly string[];
}

/** Whether each module is active, keyed by module ID. */
export type ActivationMap = Readonly<Record<string, boolean>>;

/**
 * List the installed modules, sorted by title in the user's language.
 * @returns Every installed module
 */
export function listInstalledModules(): ModuleEntry[] {
  const collator = new Intl.Collator(game.i18n.lang, { sensitivity: 'base', numeric: true });
  const languageNames = new Intl.DisplayNames(game.i18n.lang, { type: 'language', fallback: 'code' });
  return Array.from(game.modules.values(), pkg => ({
    id: pkg.id,
    title: pkg.title,
    version: pkg.version,
    badge: toBadge(pkg.getVersionBadge()),
    description: foundry.utils.cleanHTML(pkg.description),
    authors: Array.from(pkg.authors, toAuthor),
    languages: Array.from(pkg.languages, ({ lang, name }) => ({
      lang,
      name: name === undefined || name === '' ? (languageNames.of(lang) ?? lang) : name,
    })),
    links: LINK_KINDS.flatMap(kind => {
      const url = packageUrl(pkg.id, pkg[kind]);
      return url === undefined ? [] : [{ kind, url }];
    }),
    compatibility: toCompatibility(pkg.compatibility),
    relationships: {
      systems: Array.from(pkg.relationships.systems, toRelation),
      requires: Array.from(pkg.relationships.requires, toRelation),
      recommends: Array.from(pkg.relationships.recommends, toRelation),
      conflicts: Array.from(pkg.relationships.conflicts, toRelation),
    },
    packs: Array.from(pkg.packs, ({ name, label, type }) => ({ name, label: game.i18n.localize(label), type })),
    library: pkg.library,
    // Only module requirements matter here: a required system or world is not something EMMA can activate.
    requires: Array.from(pkg.relationships.requires)
      .filter(({ type }) => type === 'module')
      .map(({ id }) => id),
  })).sort((a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
}

/**
 * Describe the compatibility badge Foundry gives a module.
 * @param badge - Foundry's badge, from `Module#getVersionBadge`
 * @returns The badge, or `null` if there is none
 */
function toBadge(badge: ReturnType<foundry.packages.Module['getVersionBadge']>): VersionBadge | null {
  if (badge === null) return null;
  const { type, icon = 'fa-solid fa-code-branch', tooltip } = badge;
  const text = new DOMParser().parseFromString(tooltip, 'text/html').body.textContent;
  return { type, icon, tooltip, text };
}

/**
 * Keep the compatibility versions a manifest gives. Foundry leaves a missing one `undefined` or `null`.
 * @param compatibility - The versions, any of which may be missing
 * @returns The versions given
 */
function toCompatibility(compatibility: Partial<Record<keyof Compatibility, unknown>>): Compatibility {
  return Object.fromEntries(
    (['minimum', 'verified', 'maximum'] as const).flatMap(bound => {
      const version = compatibility[bound];
      return typeof version === 'string' && version !== '' ? [[bound, version]] : [];
    }),
  );
}

/** A related package as a manifest gives it. */
interface Related {
  id: string;
  type: 'module' | 'system' | 'world';
  reason?: string | undefined;
}

/**
 * Describe a package a module relates to.
 * @param related - The package, as the manifest gives it
 * @param related.id - Its ID
 * @param related.type - Its package type
 * @param related.reason - Why the module relates to it
 * @returns The relation
 */
function toRelation({ id, type, reason }: Related) {
  return {
    id,
    type,
    title: packageTitle(id, type),
    ...(reason === undefined || reason === '' ? {} : { reason }),
  } satisfies ModuleRelation;
}

/**
 * The title of a package, where the world can know it: an installed module, or the game system in use.
 * @param id - The package's ID
 * @param type - Its package type
 * @returns Its title, or its ID if the world does not know it
 */
function packageTitle(id: string, type: Related['type']): string {
  if (type === 'module') return game.modules.get(id)?.title ?? id;
  if (type === 'system' && game.system.id === id) return game.system.title;
  return id;
}

/** An author as a manifest gives them, where each contact detail may be missing. */
interface Author {
  name: string;
  url?: string | undefined;
  email?: string | undefined;
  discord?: string | undefined;
}

/**
 * Describe a module author, keeping only the contact details that are given and safe to show.
 * @param author - The author, as the manifest gives them
 * @param author.name - Their name
 * @param author.url - Their web page
 * @param author.email - Their email address
 * @param author.discord - Their Discord user name
 * @returns The author
 */
function toAuthor({ name, url, email, discord }: Author) {
  const link = webUrl(url);
  return {
    name,
    ...(link === undefined ? {} : { url: link }),
    ...(email === undefined ? {} : { email }),
    ...(discord === undefined ? {} : { discord }),
  } satisfies ModuleAuthor;
}

/**
 * A manifest URL, if it is safe to link to: only web pages are, so a `javascript:` URL cannot run when clicked.
 * @param url - The URL from the manifest
 * @returns The URL, or `undefined` if it is missing, malformed, or not `http` or `https`
 */
function webUrl(url: string | undefined): string | undefined {
  if (url === undefined || !URL.canParse(url)) return undefined;
  const { protocol } = new URL(url);
  return protocol === 'http:' || protocol === 'https:' ? url : undefined;
}

/**
 * A URL from a module's manifest, if it is safe to link to. A relative URL, such as `README.md`, is a file in the
 * module's folder on the Foundry server.
 * @param id - The module's ID
 * @param url - The URL from the manifest
 * @returns The absolute URL, or `undefined` if it is missing, malformed, or not `http` or `https`
 */
function packageUrl(id: string, url: string | null | undefined): string | undefined {
  if (typeof url !== 'string' || url === '') return undefined;
  const base = new URL(`${foundry.utils.getRoute(`modules/${id}`)}/`, window.location.origin);
  if (!URL.canParse(url, base)) return undefined;
  const absolute = new URL(url, base);
  return absolute.protocol === 'http:' || absolute.protocol === 'https:' ? absolute.href : undefined;
}

/**
 * Read which modules the world has saved as active. Installed modules missing from the setting are inactive, and
 * entries for modules no longer installed are left out.
 * @returns The saved activation of every installed module
 */
export function readActivation(): ActivationMap {
  const saved = game.settings.get('core', 'moduleConfiguration');
  return Object.fromEntries(Array.from(game.modules.keys(), id => [id, saved[id] === true]));
}

/**
 * Whether the current user may change which modules are active: a GM (or assistant GM) who also holds the
 * "Modify Configuration Settings" permission, without which Foundry refuses to save the setting. Nobody may before
 * Foundry has set up the current user.
 * @returns `true` if {@link writeActivation} is allowed
 */
export function canManageModules(): boolean {
  const user = game.user;
  return user !== null && user.isGM && user.can('SETTINGS_MODIFY');
}

/**
 * Save which modules are active. Entries for modules that are not installed are dropped, and nothing is written if
 * the activation is unchanged. The caller is responsible for asking the user to reload.
 * @param activation - The activation to save
 * @returns `true` if the setting changed, so that the world must reload
 * @throws {Error} If the current user may not manage modules
 */
export async function writeActivation(activation: ActivationMap): Promise<boolean> {
  if (!canManageModules()) throw new Error('Only a GM may change which modules are active');

  const current = readActivation();
  const next = Object.fromEntries(Object.keys(current).map(id => [id, activation[id] ?? current[id] === true]));
  if (Object.keys(next).every(id => next[id] === current[id])) return false;

  await game.settings.set('core', 'moduleConfiguration', next);
  return true;
}

/**
 * Ask the user to reload the world so a saved activation takes effect, as Foundry's own Module Management window does.
 * Every connected client reloads with the GM.
 * @returns Once the user has answered
 */
export async function requestReload(): Promise<void> {
  await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
}
