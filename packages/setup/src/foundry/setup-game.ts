/**
 * The only place EMMA reads Foundry VTT's setup screen: the `game` it runs there, an instance of Foundry's `Setup`,
 * which Foundry's types do not describe. Everything else works on the plain values returned here.
 *
 * Checked on Foundry 14.368: the setup screen's `game.view` is `"setup"`, and `game.worlds`, `game.modules` and
 * `game.systems` are collections of the installed packages, as `foundry.packages` instances. A module's
 * `relationships.systems` and `relationships.requires` are sets of the packages it relates to, each with its `id`.
 * Each package's `toObject()` gives its manifest as Foundry read it, and `manifest` the URL it declares; `game.release`
 * gives the Foundry build's `generation` and `channel`.
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

/** The Foundry build the server runs. */
export interface CoreBuild {
  /** Such as `14.368`. */
  readonly version: string;
  readonly generation: number;
  /** Such as `stable`, as Foundry names it. */
  readonly channel: string;
}

/** An installed package's manifest, as Foundry read it. */
export interface PackageManifest {
  readonly type: 'module' | 'system';
  readonly id: string;
  readonly version: string;
  /** The manifest, as plain data. */
  readonly json: unknown;
  /** Where Foundry read it from, such as `modules/<id>/module.json`. */
  readonly origin: string;
  /** The manifest URL it declares, if any: where newer versions are found. */
  readonly manifest?: string;
}

/** What the installed packages' manifests say, to look up their releases with. */
export interface InstalledManifests {
  readonly core: CoreBuild;
  /** The installed systems' and modules' manifests; those Foundry could not give are left out. */
  readonly manifests: readonly PackageManifest[];
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
  /** The Foundry build; read with care, as Foundry's types do not describe it here. */
  readonly release?: unknown;
  readonly worlds: Iterable<unknown>;
  readonly modules: Iterable<unknown>;
  readonly systems: Iterable<unknown>;
  /** Sends a request to the server; every package installation and update goes through it. */
  post: (request: SetupRequest, options?: object) => Promise<unknown>;
  /** Installs a package, or updates it, through {@link post}; the package installed, once it is. */
  installPackage?: (options: PackageInstall) => Promise<unknown>;
  /** Asks the user whether to install a package's missing dependencies, and installs those chosen. */
  installDependencies?: (pkg: unknown) => Promise<unknown>;
}

/** What `game.installPackage` is given. */
export interface PackageInstall {
  readonly type: 'module' | 'system';
  readonly id: string;
  readonly manifest: string;
  /** Whether Foundry asks the user about the package's dependencies after it, by itself. */
  readonly dependencies?: boolean;
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
 * Read the installed packages' manifests, and the Foundry build.
 * @param game - The setup screen's `game`
 * @returns The manifests
 */
export function readManifests(game: SetupGame): InstalledManifests {
  return {
    core: coreBuild(game),
    manifests: [
      ...Array.from(game.systems, pkg => toManifest(pkg, 'system')),
      ...Array.from(game.modules, pkg => toManifest(pkg, 'module')),
    ].filter(manifest => manifest !== undefined),
  };
}

/**
 * The Foundry build, from `game.release`; a stable build of the version's generation if Foundry does not say.
 * @param game - The setup screen's `game`
 * @returns The build
 */
function coreBuild(game: SetupGame): CoreBuild {
  const release = (typeof game.release === 'object' && game.release !== null ? game.release : {}) as Record<
    string,
    unknown
  >;
  const { generation, channel } = release;
  return {
    version: game.version,
    generation: typeof generation === 'number' ? generation : Number.parseInt(game.version, 10),
    channel: typeof channel === 'string' ? channel : 'stable',
  };
}

/**
 * An installed package's manifest.
 * @param pkg - A package from the setup screen's `game.systems` or `game.modules`
 * @param type - Which
 * @returns The manifest, or `undefined` if Foundry cannot give it, or it lacks an ID or version
 */
function toManifest(pkg: unknown, type: 'module' | 'system'): PackageManifest | undefined {
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const { id, version, manifest, toObject } = pkg as Record<string, unknown>;
  if (typeof id !== 'string' || typeof version !== 'string' || typeof toObject !== 'function') return undefined;
  const json: unknown = (toObject as () => unknown).call(pkg);
  return {
    type,
    id,
    version,
    json,
    origin: `${type}s/${id}/${type}.json`,
    ...(typeof manifest === 'string' && manifest !== '' && { manifest }),
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
