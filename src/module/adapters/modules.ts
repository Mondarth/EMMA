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
