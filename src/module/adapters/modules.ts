/**
 * The only place EMMA reads or changes which modules are installed and active. Everything else works on the plain
 * values returned here, so the UI and the state store can be tested without Foundry.
 *
 * Activation is read from and written to the world setting `core.moduleConfiguration`, as Foundry's own Module
 * Management window does. A change only takes effect once the world reloads.
 */

/** An installed module, as EMMA shows it. */
export interface ModuleEntry {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  /** Author names, in manifest order. */
  readonly authors: readonly string[];
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
  return Array.from(game.modules.values(), pkg => ({
    id: pkg.id,
    title: pkg.title,
    version: pkg.version,
    authors: Array.from(pkg.authors, author => author.name),
    // Only module requirements matter here: a required system or world is not something EMMA can activate.
    requires: Array.from(pkg.relationships.requires)
      .filter(({ type }) => type === 'module')
      .map(({ id }) => id),
  })).sort((a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
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
