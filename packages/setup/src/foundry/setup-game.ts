/**
 * The only place EMMA reads Foundry VTT's setup screen: the `game` it runs there, an instance of Foundry's `Setup`,
 * which Foundry's types do not describe. Everything else works on the plain values returned here.
 *
 * Checked on Foundry 14.368: the setup screen's `game.view` is `"setup"`, and `game.worlds`, `game.modules` and
 * `game.systems` are collections of the installed packages, as `foundry.packages` instances. A module's
 * `relationships.systems` and `relationships.requires` are sets of the packages it relates to, each with its `id`.
 */

/** An installed package, as EMMA shows it. */
export interface InstalledPackage {
  readonly id: string;
  readonly title: string;
  readonly version: string;
}

/** An installed module, with what its manifest says it needs. */
export interface InstalledModule extends InstalledPackage {
  /** The IDs of the game systems it is for; empty if it is for any system. */
  readonly systems: readonly string[];
  /** The IDs of the modules it requires. */
  readonly requires: readonly string[];
}

/** An installed world. Unlike a module or a system, a world need not have a version. */
export interface InstalledWorld {
  readonly id: string;
  readonly title: string;
  /** The game system the world uses. */
  readonly system: string;
}

/** What is installed on the Foundry server. */
export interface Installation {
  /** The Foundry version, such as `14.368`. */
  readonly core: string;
  readonly worlds: readonly InstalledWorld[];
  readonly modules: readonly InstalledModule[];
  readonly systems: readonly InstalledPackage[];
}

/** A request the setup screen sends its server, such as `{ action: "installPackage", … }`. */
export interface SetupRequest {
  readonly action?: unknown;
  readonly [key: string]: unknown;
}

/** The parts of the setup screen's `game` that EMMA uses. */
export interface SetupGame {
  readonly view: 'setup';
  readonly version: string;
  readonly worlds: Iterable<unknown>;
  readonly modules: Iterable<unknown>;
  readonly systems: Iterable<unknown>;
  /** Sends a request to the server; every package installation and update goes through it. */
  post: (request: SetupRequest, options?: object) => Promise<unknown>;
}

/**
 * Whether a value is the setup screen's `game`.
 * @param value - Any value, such as `globalThis.game`
 * @returns `true` for the setup screen's `game`
 */
export function isSetupGame(value: unknown): value is SetupGame {
  if (typeof value !== 'object' || value === null) return false;
  const game = value as Record<string, unknown>;
  return (
    game.view === 'setup' &&
    typeof game.version === 'string' &&
    typeof game.post === 'function' &&
    [game.worlds, game.modules, game.systems].every(isIterable)
  );
}

/**
 * The setup screen's `game`, if this page is Foundry's setup screen and has set it up.
 * @returns The `game`, or `undefined` on any other page, or before Foundry has made it
 */
export function setupGame(): SetupGame | undefined {
  const game: unknown = Reflect.get(globalThis, 'game');
  return isSetupGame(game) ? game : undefined;
}

/**
 * Read what is installed, sorted by title in the user's language.
 * @param game - The setup screen's `game`
 * @returns The installation
 */
export function readInstallation(game: SetupGame): Installation {
  return {
    core: game.version,
    worlds: sorted(Array.from(game.worlds, toWorld)),
    modules: sorted(Array.from(game.modules, toModule)),
    systems: sorted(Array.from(game.systems, toPackage)),
  };
}

/**
 * Describe an installed world.
 * @param world - A world from the setup screen's `game.worlds`
 * @returns The world, or `undefined` if it lacks an ID, title or system
 */
function toWorld(world: unknown): InstalledWorld | undefined {
  if (typeof world !== 'object' || world === null) return undefined;
  const { id, title, system } = world as Record<string, unknown>;
  return typeof id === 'string' && typeof title === 'string' && typeof system === 'string'
    ? { id, title, system }
    : undefined;
}

/**
 * Describe an installed package.
 * @param pkg - A package from one of the setup screen's collections
 * @returns The package, or `undefined` if it lacks an ID, title or version
 */
function toPackage(pkg: unknown): InstalledPackage | undefined {
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const { id, title, version } = pkg as Record<string, unknown>;
  return typeof id === 'string' && typeof title === 'string' && typeof version === 'string'
    ? { id, title, version }
    : undefined;
}

/**
 * Describe an installed module.
 * @param pkg - A module from the setup screen's `game.modules`
 * @returns The module, or `undefined` if it lacks an ID, title or version
 */
function toModule(pkg: unknown): InstalledModule | undefined {
  const described = toPackage(pkg);
  if (described === undefined) return undefined;
  const { relationships } = pkg as { relationships?: { systems?: unknown; requires?: unknown } };
  return {
    ...described,
    systems: relatedIds(relationships?.systems),
    // A module requires other modules: a system it needs is given by `systems`.
    requires: relatedIds(relationships?.requires, 'module').filter(id => id !== described.id),
  };
}

/**
 * The IDs of the packages a relationship names.
 * @param related - The relationship, a set of packages
 * @param type - The type of package to keep, if the relationship says; any type if not given
 * @returns The IDs, each once, in their order
 */
function relatedIds(related: unknown, type?: string): string[] {
  if (!isIterable(related)) return [];
  const ids = new Set<string>();
  for (const entry of related) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, type: kind } = entry as Record<string, unknown>;
    if (typeof id === 'string' && (type === undefined || kind === undefined || kind === type)) ids.add(id);
  }
  return [...ids];
}

/**
 * Drop what is missing and sort by title, then ID.
 * @param packages - The packages
 * @returns The packages sorted
 */
function sorted<T extends { readonly id: string; readonly title: string }>(packages: readonly (T | undefined)[]): T[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return packages
    .filter(pkg => pkg !== undefined)
    .sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.id, b.id));
}

/**
 * Whether a value can be iterated.
 * @param value - Any value
 * @returns `true` for an iterable
 */
function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}
