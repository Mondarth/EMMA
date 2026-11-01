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
  /** What the server sent the setup screen, such as `coreUpdate` and `options`; read with care, as for `release`. */
  readonly data?: unknown;
  readonly worlds: Iterable<unknown>;
  readonly modules: Iterable<unknown>;
  readonly systems: Iterable<unknown>;
  /** Foundry's translations, for the messages its server answers with. */
  readonly i18n?: { localize(key: string): string };
  /** Sends a request to the server; every package installation and update goes through it. */
  post: (request: SetupRequest, options?: object) => Promise<unknown>;
  /** Installs a package, or updates it, through {@link post}; the package installed, once it is. */
  installPackage?: (options: PackageInstall) => Promise<unknown>;
  /** Asks the user whether to install a package's missing dependencies, and installs those chosen. */
  installDependencies?: (pkg: unknown) => Promise<unknown>;
  /** Makes a snapshot of the installation, as **Manage Backups** does, with a note; it says itself if it fails. */
  createSnapshot?: (options: { readonly note?: string }) => Promise<unknown>;
  /** Backs a package up, such as a world, with a note; whether it did. */
  createBackup?: (
    pkg: { readonly type: 'world' | 'module' | 'system'; readonly id: string; readonly title: string },
    options: { readonly note?: string },
  ) => Promise<boolean>;
}

/** The disk space a snapshot of the installation needs, and the space free, in bytes. */
export interface SnapshotSpace {
  readonly required: number;
  readonly available: number;
}

/**
 * Ask the server how much disk space a snapshot of the installation needs, and how much is free, as Foundry's own
 * **Manage Backups** dialog does before it makes one. The server works it out from every package installed, so it may
 * take a while.
 *
 * The request's action, `checkCreateSnapshotDiskSpace`, is the server's, not a documented API: Foundry 14.368's
 * `SnapshotOperationDialog` sends it through `game.post` and reads `required` and `available` from the answer. This is
 * the one place EMMA sends it; refactor here should Foundry give it an API.
 * @param game - The setup screen's `game`
 * @returns The space
 * @throws {Error} When the answer is not as Foundry 14.368 gives it
 */
export async function checkSnapshotSpace(game: SetupGame): Promise<SnapshotSpace> {
  const answer = await game.post({ action: 'checkCreateSnapshotDiskSpace' }, { timeoutMs: null });
  const { required, available } = (typeof answer === 'object' && answer !== null ? answer : {}) as Record<
    string,
    unknown
  >;
  if (typeof required !== 'number' || typeof available !== 'number') {
    throw new Error('The server did not say how much space a snapshot needs');
  }
  return { required, available };
}

/** Whether Foundry can update itself in place, and the channel its updater takes builds from. */
export interface CoreUpdateState {
  /** `false` when the server was started with `--noupdate`, which refuses every update in place. */
  readonly canUpdate: boolean;
  /** Such as `stable`. */
  readonly channel: string;
}

/**
 * Whether Foundry can update itself in place, from what the server sent the setup screen.
 *
 * Checked on Foundry 14.368: `game.data.coreUpdate.canUpdate` is `!options.noupdate`, and `game.data.options` has the
 * `updateChannel` the Update Software form sends. Neither is a documented API.
 * @param game - The setup screen's `game`
 * @returns Whether it can, and the channel; it cannot if the server does not say
 */
export function readCoreUpdate(game: SetupGame): CoreUpdateState {
  const { coreUpdate, options } = record(game.data);
  const channel = record(options).updateChannel;
  return {
    canUpdate: record(coreUpdate).canUpdate === true,
    channel: typeof channel === 'string' ? channel : 'stable',
  };
}

/** The build Foundry's updater would install: the newest on its channel, or why there is none. */
export type CoreTarget =
  | {
      readonly version: string;
      /** Whether Foundry installs it only by hand, as a new generation. */
      readonly manual: boolean;
    }
  | { readonly none: string };

/**
 * Ask Foundry's updater which build it would install, as the Update Software form's first step does. The server asks
 * Foundry's website, which gives only the newest build on the channel.
 *
 * Checked on Foundry 14.368: the form posts `{ action: "updateCheck", updateChannel, forceUpdate }`; the answer is the
 * build's release data (`generation`, `build`, and `flags` that say whether it must be installed by hand), or an
 * `info` or `warn` message key when there is none.
 * @param game - The setup screen's `game`
 * @param channel - The channel
 * @returns The build, or why there is none
 * @throws {Error} When the answer is not as Foundry 14.368 gives it
 */
export async function checkCoreUpdate(game: SetupGame, channel: string): Promise<CoreTarget> {
  const answer = record(
    await game.post({ action: 'updateCheck', updateChannel: channel, forceUpdate: false }, { notify: false }),
  );
  const message = answer.info ?? answer.warn;
  if (typeof message === 'string') return { none: game.i18n?.localize(message) ?? message };
  const { generation, build, flags } = answer;
  if (typeof generation !== 'number' || typeof build !== 'number') {
    throw new Error('Foundry did not say which build its updater would install');
  }
  const { requires_generation_reinstall, requires_electron_reinstall, requires_full_reinstall } = record(flags);
  return {
    version: `${String(generation)}.${String(build)}`,
    manual: [requires_generation_reinstall, requires_electron_reinstall, requires_full_reinstall].some(Boolean),
  };
}

/**
 * Start Foundry's updater on the build {@link checkCoreUpdate} found, as the Update Software form's second step does.
 * The server downloads and installs it, then stops, or restarts where it can; the setup screen loses it meanwhile.
 *
 * Checked on Foundry 14.368: the form posts `{ action: "updateDownload", updateChannel, forceUpdate }`, which answers
 * once the download has begun, or with an `error`.
 * @param game - The setup screen's `game`
 * @param channel - The channel, as checked
 * @returns Once the update has begun
 * @throws {Error} If the server refuses it, saying why
 */
export async function startCoreUpdate(game: SetupGame, channel: string): Promise<void> {
  const answer = record(
    await game.post({ action: 'updateDownload', updateChannel: channel, forceUpdate: false }, { notify: false }),
  );
  if (typeof answer.error === 'string') throw new Error(game.i18n?.localize(answer.error) ?? answer.error);
}

/**
 * A value's properties, if it is an object.
 * @param value - Any value
 * @returns Its properties; none for anything else
 */
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** What `game.installPackage` is given. */
export interface PackageInstall {
  readonly type: 'module' | 'system';
  readonly id: string;
  readonly manifest: string;
  /** Whether Foundry asks the user about the package's dependencies after it, by itself. */
  readonly dependencies?: boolean;
  /** Whether Foundry says itself that the package was installed, or why not. */
  readonly notify?: boolean;
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
