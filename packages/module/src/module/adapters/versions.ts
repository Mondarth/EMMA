/**
 * The only place EMMA looks up the versions of the packages in use, for hypothetical mode. It asks
 * `@mondarth/fvtt-resolver` for every release of the system and the active modules, then judges a version of a module
 * by checking the setup it would make, with the core, the system and the other modules' chosen versions. The verdict
 * becomes the badge Foundry's own `Module.getVersionBadge` gives it, so the colours and tooltips are Foundry's (see
 * `badges.ts`).
 *
 * The core and the system may be chosen too. A version of either is judged by how well the setup it would make fits:
 * by the worst badge it would leave the system or an active module with.
 *
 * Every release comes from EMMA's package catalogue, in one lookup of the system and every installed module, as its
 * version 2 gives them (see `catalogueSet` in `@mondarth/fvtt-resolver/sources`), with Foundry's builds: nothing else
 * is asked. When there is no catalogue to ask, or it cannot be reached, only the installed versions are known, from
 * their manifests, and every package is unreached.
 */
import type {
  PackageRef as ResolverRef,
  CoreChannel,
  CoreRelease,
  PackageVersion,
  ReleaseCheck,
  Relationship,
  Release,
  SetupSpec,
} from '@mondarth/fvtt-resolver';
import {
  check,
  isNewerVersion,
  missingManifest,
  normaliseManifest,
  packageKey,
  sameVersion,
} from '@mondarth/fvtt-resolver';
import type { LocalManifest } from '@mondarth/fvtt-resolver/sources';
import { catalogueSet, catalogueSource, localSource } from '@mondarth/fvtt-resolver/sources';

import { format, formatList, localize } from '@module/lib/i18n';
import { isIncompatible } from '@module/lib/incompatible';
import { ignoredNoteOf } from '@module/state/hypothetical-ignored.svelte';

import { explanationMessages } from './explanation';
import type { VersionBadge } from './modules';
import { releaseBadge } from './badges';
import type { PlanEntry, SetupCheck, SetupSolve, UnavailableModule } from './report';
import { checkReport, planReport, solveReport } from './report';

/** A package, by type and ID; Foundry itself is the package of type `core`, with the ID `core`. */
export interface PackageRef {
  readonly type: 'core' | 'module' | 'system' | 'world';
  readonly id: string;
}

/** The parts of a setup that are not modules: Foundry itself and the game system. */
export type PlatformPart = 'core' | 'system';

/** One version of a module, with the badge Foundry would give it. */
export interface VersionOption {
  readonly version: string;
  /** The badge, or `null` if Foundry gives none. */
  readonly badge: VersionBadge | null;
  /** A version not on Foundry's package listing, such as one its author has published on GitLab ahead of it. */
  readonly unlisted?: true;
  /**
   * A version found without a manifest URL for it alone, which installing it needs: it cannot be chosen. Never the
   * installed version, which needs none.
   */
  readonly missingManifest?: true;
}

/**
 * The versions found of the system and the installed modules, and how to judge them. They are looked up once, all
 * together, when first needed.
 */
export interface VersionJudge {
  /**
   * The packages whose versions could not all be fetched or read, so may be missing or judged on less than their
   * manifests declare.
   */
  readonly unreached: readonly PackageRef[];
  /**
   * Whether EMMA's catalogue answered the lookup: if not, as without one, only the installed versions are known.
   * `false` until the lookup is done.
   */
  readonly reached: boolean;
  /**
   * Look up the versions of the core, the system and every installed module, in one request, the first time; later
   * calls ask nothing more, as everything installed was looked up.
   * @param ids - The module IDs needed now, which the first lookup includes with the others
   * @returns Once they are looked up; what could not be had is kept in {@link VersionJudge.unreached}
   */
  lookUp(ids: Iterable<string>): Promise<void>;
  /**
   * The versions of a module that may be chosen: the installed one, as many before it as the user chose to be shown, and
   * every newer one found.
   * @param id - The module ID
   * @returns The versions, newest first; none for a module not looked up
   */
  versionsOf(id: string): readonly string[];
  /**
   * The versions of the core or the system that may be chosen: the one in use and every newer one found. Newer cores
   * are those on the channel of the core in use or a more stable one.
   * @param part - The core or the system
   * @returns The versions, newest first; only the one in use until it is looked up
   */
  platformVersions(part: PlatformPart): readonly string[];
  /**
   * The badge each active module gets at its chosen version, in the setup the choices make.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen
   * @returns The chosen version and its badge, keyed by module ID; none for a module whose release is not known
   */
  judgeChoices(active: Iterable<string>, choices: VersionChoices): ReadonlyMap<string, VersionOption>;
  /**
   * The badge each version of a module that may be chosen would get, with the other modules at their chosen versions.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen
   * @param id - The module ID
   * @returns Each version, newest first, with its badge
   */
  judgeVersions(active: Iterable<string>, choices: VersionChoices, id: string): readonly VersionOption[];
  /**
   * How well each version of the core or the system that may be chosen fits the setup, with everything else at its
   * chosen version: each badge is the worst the system or an active module would get, naming those that do not fit.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen
   * @param part - The core or the system
   * @returns Each version, newest first, with its badge
   */
  judgePlatform(active: Iterable<string>, choices: VersionChoices, part: PlatformPart): readonly VersionOption[];
  /**
   * Check the setup the choices make, in words: what keeps each package from being used, what it prefers and is not
   * given, and what it advises.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen
   * @returns What the check found
   */
  reportCheck(active: Iterable<string>, choices: VersionChoices): SetupCheck;
  /**
   * Find the best versions of the active modules: the newest of each that works with the others and with the core and
   * system chosen, or say in words why there are none. It may fetch the manifests of releases known only from a
   * listing.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen
   * @returns The best setup, or why there is none
   */
  reportSolve(active: Iterable<string>, choices: VersionChoices): Promise<SetupSolve>;
  /**
   * The active modules the reports leave out, as hypothetical mode ignores them, so that a report can warn that it may
   * be inaccurate.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen, with the modules ignored
   * @returns Their titles
   */
  reportIgnored(active: Iterable<string>, choices: VersionChoices): readonly string[];
  /**
   * The active modules that cannot be had, as the catalogue says: archived on Foundry VTT, or gone. Nothing of them is
   * resolved or judged, so the reports leave them out and name them. A module hypothetical mode ignores is not one.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen, with the modules ignored
   * @returns Each, with its title and why
   */
  reportUnavailable(active: Iterable<string>, choices: VersionChoices): readonly UnavailableModule[];
  /**
   * Plan the setup the choices make: each active module at the version chosen, with its manifest URL, those others
   * depend on first.
   * @param active - The IDs of the modules the setup has
   * @param choices - The versions chosen
   * @returns The plan, in order
   */
  reportPlan(active: Iterable<string>, choices: VersionChoices): readonly PlanEntry[];
}

/** The releases found so far, and what is needed to judge them. */
interface VersionCatalogue {
  /** Every release found, of the system and the modules. */
  readonly releases: readonly Release[];
  /** The core releases known: the one in use, and those found. */
  readonly cores: readonly CoreRelease[];
  /** The versions installed of every installed module, keyed by module ID. */
  readonly installed: ReadonlyMap<string, string>;
  /** The core and system in use. */
  readonly base: Omit<SetupSpec, 'modules'>;
  /** The core release in use. */
  readonly core: CoreRelease;
  /** The titles of the system and the installed modules, keyed by package key, to name them in tooltips. */
  readonly titles: ReadonlyMap<string, string>;
  /** The modules that cannot be had, and why, keyed by module ID: nothing of them is resolved or judged. */
  readonly unavailable: ReadonlyMap<string, Omit<UnavailableModule, 'title'>>;
  /** How many versions before the one installed, or chosen, are offered and considered, as the user chose. */
  readonly olderVersions: () => number;
}

/**
 * A setup to check, always with its modules, and the package keys of those taken as present without being judged (see
 * {@link VersionChoices.ignored}).
 */
type Setup = SetupSpec & { readonly modules: readonly PackageVersion[]; readonly assumed?: ReadonlySet<string> };

/** The versions chosen; anything not given is at the version in use. */
export interface VersionChoices {
  /** The core version chosen. */
  readonly core?: string | undefined;
  /** The system version chosen. */
  readonly system?: string | undefined;
  /** The versions chosen for modules, keyed by module ID. */
  readonly modules: ReadonlyMap<string, string>;
  /**
   * Modules hypothetical mode ignores, by ID, such as one with no manifest a source can read: taken as present at their
   * installed versions, so what requires them is satisfied, but never looked up, judged or reported.
   */
  readonly ignored?: ReadonlySet<string> | undefined;
}

const CHANNELS: readonly CoreChannel[] = ['stable', 'testing', 'development', 'prototype'];

/** How {@link createVersionJudge} fetches. */
export interface FindOptions {
  /**
   * EMMA's version, named to the catalogue in `X-Catalogue-Client` so its logs can say which version asks for what, or
   * `null` for none.
   */
  readonly clientVersion?: string | null;
  /** EMMA's package catalogue, with its key, or `null` for none: then only the installed versions are known. */
  readonly catalogue?: { readonly url: string; readonly key: string } | null;
  /** Fetches; the browser's by default. */
  readonly fetch?: typeof globalThis.fetch;
  /**
   * How many versions before the one installed, or chosen, are offered and considered: read on every judgement, so a
   * change is followed. None by default.
   */
  readonly olderVersions?: () => number;
}

/**
 * A manifest URL, if it is one the catalogue takes, a web address: it refuses a lookup that gives any other.
 * @param manifest - What the package's manifest declares
 * @returns The URL, or `undefined`
 */
function webManifest(manifest: unknown): string | undefined {
  if (typeof manifest !== 'string') return undefined;
  try {
    return ['http:', 'https:'].includes(new URL(manifest).protocol) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sort versions newest first, in Foundry's order, a leading `v` aside.
 * @param versions - The versions
 * @returns A new array, newest first
 */
function newestFirst(versions: Iterable<string>): string[] {
  return [...versions].sort((a, b) => Number(newer(b, a)) - Number(newer(a, b)));
}

/**
 * Read the core release in use.
 * @returns The core release
 */
function readCore(): CoreRelease {
  const { generation, channel } = game.release;
  const known = CHANNELS.find(name => name === channel);
  return { version: game.version, generation, channel: known ?? 'stable' };
}

/**
 * The manifests of the system in use and every installed module, as Foundry read them.
 * @returns The manifests
 */
function installedManifests(): LocalManifest[] {
  const system = game.system;
  return [
    { json: system.toObject(), origin: `systems/${system.id}/system.json`, type: 'system' },
    ...Array.from(game.modules.values(), pkg => ({
      json: pkg.toObject(),
      origin: `modules/${pkg.id}/module.json`,
      type: 'module' as const,
    })),
  ];
}

/**
 * The badges EMMA gives the installed modules, judged from their installed manifests alone: nothing is fetched.
 * @param active - The IDs of the modules staged active
 * @returns Each module's badge, keyed by module ID; none for a module whose manifest could not be read
 */
export type InstalledJudge = (active: Iterable<string>) => ReadonlyMap<string, VersionBadge | null>;

/**
 * Checking the installed modules: their releases, as their manifests give them, and what checking finds of some of
 * them in a setup of their own, with the Foundry version and the game system in use.
 * @returns The modules' releases, by ID, and the check
 */
function installedChecks() {
  const core = readCore();
  const releases = localReleases(installedManifests());
  const systemKey = packageKey({ type: 'system', id: game.system.id });
  const systemVersion = game.system.version;
  const modules = new Map(
    releases.flatMap(release => (release.package.type === 'module' ? [[release.package.id, release] as const] : [])),
  );
  const systems = releases.filter(release => release.package.type === 'system');

  /**
   * What checking found of some modules, with the system in use.
   * @param judged - The releases of the modules
   * @returns What checking found of each
   */
  function checked(judged: readonly Release[]): readonly ReleaseCheck[] {
    const setup: SetupSpec = {
      core: core.version,
      system: { package: systemKey, version: systemVersion },
      modules: judged.map(release => ({ package: packageKey(release.package), version: release.version })),
    };
    return check({ core: [core], releases: [...systems, ...judged] }, setup).releases;
  }

  return { modules, checked };
}

/**
 * The installed modules EMMA judges incompatible (see `isIncompatible`) with the Foundry version and game system in
 * use, as their manifests declare, whatever else is active, which is how an inactive module's badge is judged.
 * @returns Their IDs
 */
export function incompatibleModules(): ReadonlySet<string> {
  const { modules, checked } = installedChecks();
  const alone = [...modules.values()].map(release => ({
    ...release,
    relationships: { ...release.relationships, requires: [], conflicts: [] },
  }));
  return new Set(
    checked(alone).flatMap(({ release: { package: pkg }, availability }) =>
      pkg.type === 'module' && isIncompatible(availability) ? [pkg.id] : [],
    ),
  );
}

/**
 * Set up judging the installed modules as EMMA does, which Foundry's own badges do not: what a module requires and
 * conflicts with, and the systems and system versions it runs in, as well as the core versions it supports. A module
 * staged active is judged in the setup of the modules staged active, the core and the system in use. One inactive is
 * judged against the core and the system alone, as what it requires and conflicts with matters only once it is
 * active; judging each in a setup of its own would cost a check for every module installed.
 * @returns The judge
 */
export function createInstalledJudge(): InstalledJudge {
  const { modules, checked } = installedChecks();

  return active => {
    const on = new Set(active);
    const badges = new Map<string, VersionBadge | null>();
    const judge = (checks: readonly ReleaseCheck[]) => {
      for (const found of checks) {
        if (found.release.package.type === 'module')
          badges.set(found.release.package.id, optionOf(found, checks).badge);
      }
    };
    // The modules staged active, together: one they require that is not among them is missing.
    const activeReleases = [...modules.values()].filter(({ package: { id } }) => on.has(id));
    judge(checked(activeReleases));
    // The inactive modules, asking nothing of each other.
    judge(
      checked(
        [...modules.values()]
          .filter(({ package: { id } }) => !on.has(id))
          .map(release => ({
            ...release,
            relationships: { ...release.relationships, requires: [], conflicts: [] },
          })),
      ),
    );
    return badges;
  };
}

/**
 * The releases installed manifests give; a manifest that cannot be read gives none.
 * @param manifests - The manifests
 * @returns The releases
 */
function localReleases(manifests: readonly LocalManifest[]): Release[] {
  return manifests.flatMap(manifest => {
    const read = normaliseManifest(manifest.json, { origin: manifest.origin, type: manifest.type });
    return read.ok ? [read.release] : [];
  });
}

/**
 * Set up looking up versions. Nothing is fetched until {@link VersionJudge.lookUp} is called.
 * @param options - How to fetch
 * @returns The judge, with nothing looked up yet
 */
export function createVersionJudge(options: FindOptions): VersionJudge {
  const { clientVersion = null, catalogue: lookupCatalogue = null, olderVersions = () => 0 } = options;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const core = readCore();
  const system = game.system;
  const installed = Array.from(game.modules.values());
  const local = localSource(installedManifests());
  // From the generation in use on: Foundry is never moved back, so nothing that runs only on an older one is chosen.
  const set =
    lookupCatalogue === null
      ? undefined
      : catalogueSet({
          catalogue: catalogueSource({
            ...lookupCatalogue,
            fetch: send,
            ...(clientVersion !== null && { client: `EMMA/${clientVersion}` }),
          }),
          fromGeneration: core.generation,
        });
  const refs: ResolverRef[] = [
    { type: 'system', id: system.id },
    ...installed.map(pkg => ({ type: 'module' as const, id: pkg.id })),
  ];
  // Each package with the version installed, and the manifest it was installed from, which finds one the catalogue
  // does not hold yet.
  const requests = [
    { type: 'system' as const, id: system.id, version: system.version, manifest: webManifest(system.manifest) },
    ...installed.map(pkg => ({
      type: 'module' as const,
      id: pkg.id,
      version: pkg.version,
      manifest: webManifest(pkg.manifest),
    })),
  ].map(({ type, id, version, manifest }) => ({
    type,
    id,
    installed: version,
    ...(manifest !== undefined && { manifest }),
  }));

  /**
   * The installed release of each package that the catalogue did not give, from its installed manifest: it gives
   * nothing of a package that cannot be had or that it does not hold yet, and may not know a version only installed
   * here.
   * @param found - The releases it gave
   * @returns The installed releases missing from them, but for the modules that cannot be had
   */
  async function installedMissing(found: readonly Release[]): Promise<Release[]> {
    const missing = await Promise.all(
      requests
        .filter(({ type, id }) => type !== 'module' || !catalogue.unavailable.has(id))
        .map(async ({ type, id, installed: version }) => {
          const ref = { type, id };
          const given = found.some(
            release => packageKey(release.package) === packageKey(ref) && sameVersion(release.version, version),
          );
          if (given) return [];
          const read = await local.releases(ref);
          return read.ok ? read.value : [];
        }),
    );
    return missing.flat();
  }

  const systemKey = packageKey({ type: 'system', id: system.id });
  const catalogue = {
    releases: [] as Release[],
    cores: [core],
    installed: new Map(installed.map(pkg => [pkg.id, pkg.version])),
    base: { core: core.version, system: { package: systemKey, version: system.version } },
    core,
    titles: new Map([
      [systemKey, system.title],
      ...installed.map(pkg => [packageKey({ type: 'module', id: pkg.id }), pkg.title] as const),
    ]),
    unavailable: new Map<string, Omit<UnavailableModule, 'title'>>(),
    olderVersions,
  };
  // Only versions with a release, which every version found has, and the installed one does unless its manifest
  // could not be read; such a module is left at its installed version, unjudged.
  const versions = new Map<string, string[]>();
  const unreached: PackageRef[] = [];
  let looked: Promise<void> | undefined;
  let reached = false;

  /** Look everything installed up, once. */
  async function lookUpAll(): Promise<void> {
    const found = await set?.lookUp(requests);
    reached = set !== undefined && set.gaps().length === 0;
    for (const { package: ref, reason, note } of set?.unavailable() ?? []) {
      if (ref.type === 'module') catalogue.unavailable.set(ref.id, { reason, ...(note !== undefined && { note }) });
    }
    const given = found?.universe.releases ?? [];
    const releases = [...given, ...(await installedMissing(given))];
    catalogue.releases.push(...releases);
    catalogue.cores.push(...(found?.universe.core ?? []).filter(({ version }) => !sameVersion(version, core.version)));
    for (const release of releases.filter(({ package: { type } }) => type === 'module')) {
      versions.set(release.package.id, [...(versions.get(release.package.id) ?? []), release.version]);
    }
    if (set === undefined || !reached) {
      unreached.push(...refs, CORE_REF);
      return;
    }
    const installedKeys = new Set(refs.map(packageKey));
    unreached.push(...set.unreached().filter(ref => installedKeys.has(packageKey(ref))));
  }

  return {
    get reached() {
      return reached;
    },
    get unreached() {
      return [...unreached];
    },
    lookUp() {
      looked ??= lookUpAll();
      return looked;
    },
    versionsOf: id => choosable(catalogue, versions, id),
    platformVersions: part => platformVersions(catalogue, part),
    judgeChoices: (active, choices) => judgeChoices(catalogue, setupOf(catalogue, active, choices)),
    judgeVersions: (active, choices, id) =>
      choices.ignored?.has(id) === true || catalogue.unavailable.has(id)
        ? []
        : judgeVersions(catalogue, setupOf(catalogue, active, choices), choosable(catalogue, versions, id), id),
    judgePlatform: (active, choices, part) =>
      platformVersions(catalogue, part).map(version => {
        const option = fitOf(catalogue, setupOf(catalogue, active, { ...choices, [part]: version }), version);
        // Foundry's builds all come from its release notes, and update themselves; only the system's versions can be
        // unlisted, or have no manifest of their own.
        if (part !== 'system') return option;
        return withManifest(catalogue, systemKey, withListing(option, isUnlisted(catalogue, systemKey, version)));
      }),
    reportCheck: (active, choices) => {
      const setup = setupOf(catalogue, active, choices);
      const report = checkReport(
        reportUniverseOf(catalogue, setup),
        setup,
        messagesOf(catalogue),
        (checked, all) => optionOf(checked, all).badge,
      );
      // A module taken as present is in the setup checked, so that what requires it is satisfied, but not reported.
      const reported = report.modules.filter(({ id }) => choices.ignored?.has(id) !== true);
      return { ...report, setup: { ...report.setup, modules: reported.length }, modules: reported };
    },
    reportPlan: (active, choices) => {
      const setup = setupOf(catalogue, active, choices);
      return planReport(reportUniverseOf(catalogue, setup), setup, messagesOf(catalogue), catalogue.installed).filter(
        ({ id }) => choices.ignored?.has(id) !== true,
      );
    },
    reportSolve: async (active, choices) => {
      const setup = setupOf(catalogue, active, choices);
      const solved = await solveReport(
        reportUniverseOf(catalogue, setup),
        setup,
        messagesOf(catalogue),
        // The catalogue gives every release it could load, loaded: there is nothing more to load.
        () => Promise.resolve([]),
        setup.modules.filter(({ package: key }) => setup.assumed?.has(key) === true),
        [
          catalogue.base.system,
          ...[...catalogue.installed].map(([id, version]) => ({
            package: packageKey({ type: 'module', id }),
            version,
          })),
        ],
      );
      // A module taken as present has one release, so cannot change; nothing of it is reported either way.
      const { solution } = solved;
      return solution.kind === 'found'
        ? {
            ...solved,
            solution: {
              ...solution,
              changes: solution.changes.filter(
                ({ package: { type, id } }) => type !== 'module' || choices.ignored?.has(id) !== true,
              ),
            },
          }
        : solved;
    },
    reportIgnored: (active, choices) =>
      [...active]
        .filter(id => choices.ignored?.has(id) === true)
        .map(id => {
          const title = catalogue.titles.get(packageKey({ type: 'module', id })) ?? id;
          // With the GMs' note on why, as the views show it.
          const note = ignoredNoteOf(id);
          return note === undefined ? title : `${title} [${note}]`;
        }),
    reportUnavailable: (active, choices) =>
      [...active].flatMap(id => {
        const unavailable = catalogue.unavailable.get(id);
        return unavailable === undefined || choices.ignored?.has(id) === true
          ? []
          : [{ title: catalogue.titles.get(packageKey({ type: 'module', id })) ?? id, ...unavailable }];
      }),
  };
}

/**
 * A version without a leading `v` before its first digit, as the resolver counts `v1.1.4` and `1.1.4` as one version.
 * @param version - The version
 * @returns The version without the `v`
 */
function unprefixed(version: string): string {
  return version.replace(/^[vV](?=\d)/, '');
}

/**
 * Whether Foundry counts one version as newer than another, a leading `v` aside.
 * @param a - A version
 * @param b - Another
 * @returns Whether `a` is newer
 */
function newer(a: string, b: string): boolean {
  return isNewerVersion(unprefixed(a), unprefixed(b));
}

/**
 * The oldest version offered or considered of a package: so many versions before the one chosen, or the oldest known
 * if fewer are older; the one chosen if none are wanted.
 * @param chosen - The version chosen
 * @param known - Every version known of the package
 * @param before - How many older versions are wanted
 * @returns The oldest version to offer or consider
 */
function floorOf(chosen: string, known: readonly string[], before: number): string {
  const older = newestFirst(known.map(unprefixed).filter(version => newer(chosen, version)));
  return older[Math.min(before, older.length) - 1] ?? chosen;
}

/**
 * The releases a report considers: of the core, the system and each module, the version the setup has, as many before
 * it as the user chose to be shown (none by default), and every newer one. Older versions are risky to install into an
 * existing world, and the oldest releases are the ones most often missing, incomplete or gone, which only filled the
 * reports with versions that could not be judged. A module the setup does not have counts from its installed version,
 * if it is installed.
 * @param catalogue - The releases found
 * @param setup - The setup reported on
 * @returns The universe, without the older releases
 */
function reportUniverseOf(
  catalogue: VersionCatalogue,
  setup: Setup,
): { core: readonly CoreRelease[]; releases: readonly Release[] } {
  const chosen = new Map<string, string>([
    ...[...catalogue.installed].map(([id, version]) => [packageKey({ type: 'module', id }), version] as const),
    [setup.system.package, setup.system.version],
    ...setup.modules.map(({ package: key, version }) => [key, version] as const),
  ]);
  const known = new Map<string, string[]>();
  for (const release of catalogue.releases) {
    const key = packageKey(release.package);
    known.set(key, [...(known.get(key) ?? []), release.version]);
  }
  const before = catalogue.olderVersions();
  const floors = new Map(
    [...chosen].map(([key, version]) => [key, floorOf(version, known.get(key) ?? [], before)] as const),
  );
  const coreFloor = floorOf(
    setup.core,
    catalogue.cores.map(({ version }) => version),
    before,
  );
  const atLeast = (version: string, floor: string | undefined) => floor === undefined || !newer(floor, version);
  return {
    core: catalogue.cores.filter(({ version }) => atLeast(version, coreFloor)),
    releases: [
      // A module taken as present is only the release it stands for, even when it was looked up before being ignored:
      // its own releases would be judged, and the solver could change it.
      ...withAssumed(
        catalogue.releases.filter(release => atLeast(release.version, floors.get(packageKey(release.package)))),
        setup,
      ),
      // The modules taken as present, as the releases they stand for.
      ...assumedReleases(setup),
    ],
  };
}

/**
 * The resolver's explanations in the user's language, naming packages by their titles.
 * @param catalogue - The releases found
 * @returns The wording
 */
function messagesOf(catalogue: VersionCatalogue) {
  return explanationMessages(key => catalogue.titles.get(key));
}

/** Foundry itself, as a package whose versions are looked up. */
const CORE_REF: PackageRef = { type: 'core', id: 'core' };

/**
 * The versions of the core or the system that may be chosen: the one in use and every newer one.
 * @param catalogue - The releases found
 * @param part - The core or the system
 * @returns The versions, newest first
 */
function platformVersions(catalogue: VersionCatalogue, part: PlatformPart): string[] {
  if (part === 'core') {
    const { version: inUse, channel } = catalogue.core;
    // As Foundry's update channels do: a stable build offers stable builds, a testing build testing ones too.
    const steadiness = CHANNELS.indexOf(channel);
    return newestFirst(
      catalogue.cores
        .filter(release => CHANNELS.indexOf(release.channel) <= steadiness && !isNewerVersion(inUse, release.version))
        .map(release => release.version),
    );
  }
  const { package: key, version } = catalogue.base.system;
  return newestFirst(
    catalogue.releases
      .filter(release => packageKey(release.package) === key && !isNewerVersion(version, release.version))
      .map(release => release.version),
  );
}

/**
 * The versions of a module that may be chosen: the installed one, as many before it as the user chose to be shown
 * (none by default), and every newer one.
 * @param catalogue - The releases found
 * @param versions - Every version found of each module, keyed by module ID
 * @param id - The module ID
 * @returns The versions, newest first
 */
function choosable(
  catalogue: VersionCatalogue,
  versions: ReadonlyMap<string, readonly string[]>,
  id: string,
): string[] {
  const found = versions.get(id) ?? [];
  const installed = catalogue.installed.get(id);
  const floor = installed === undefined ? undefined : floorOf(installed, found, catalogue.olderVersions());
  return newestFirst(found.filter(version => floor === undefined || !newer(floor, version)));
}

/**
 * The modules of a setup at their chosen versions.
 * @param catalogue - The releases found
 * @param active - The IDs of the modules the setup has
 * @param choices - The versions chosen
 * @returns The version of each installed module of the setup, keyed by module ID
 */
function setupOf(catalogue: VersionCatalogue, active: Iterable<string>, choices: VersionChoices): Setup {
  const ignored = choices.ignored ?? new Set<string>();
  // An ignored module is taken as present whether it is staged active or not, so that one another requires, as
  // midi-qol pulls in a synthetic module, is there for it: it is never judged or reported either way.
  const present = new Set([...active, ...[...ignored].filter(id => catalogue.installed.has(id))]);
  const modules = [...present].flatMap(id => {
    // A module that cannot be had is left out of the setup, unless hypothetical mode ignores it, taking it as present.
    if (catalogue.unavailable.has(id) && !ignored.has(id)) return [];
    const installed = catalogue.installed.get(id);
    // An ignored module stays at its installed version: nothing is known of its others.
    const version = ignored.has(id) ? installed : (choices.modules.get(id) ?? installed);
    return version === undefined ? [] : [{ package: packageKey({ type: 'module', id }), version }];
  });
  const assumed = new Set([...ignored].map(id => packageKey({ type: 'module', id })));
  const { core, system } = catalogue.base;
  return {
    core: choices.core ?? core,
    system: { package: system.package, version: choices.system ?? system.version },
    modules,
    ...(assumed.size > 0 && { assumed }),
  };
}

/**
 * The release a module taken as present stands for: at its version, verified with the setup's core, so that it suits
 * it and what requires it is satisfied, and with no relationships, so that it asks nothing of the setup. It declares
 * that compatibility rather than none, as the update's policy refuses a release that declares none.
 * @param key - The module's package key
 * @param version - Its version in the setup
 * @param core - The setup's core version
 * @returns The release
 */
function assumedRelease(key: string, version: string, core: string): Release {
  const id = key.slice('module:'.length);
  return {
    package: { type: 'module', id },
    version,
    compatibility: { minimum: core, verified: core },
    relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
    protected: false,
    origin: `modules/${id}/module.json`,
    detail: 'loaded',
  };
}

/**
 * The releases a setup's modules taken as present stand for.
 * @param setup - The setup
 * @returns One release for each
 */
function assumedReleases(setup: Setup): Release[] {
  return setup.modules
    .filter(({ package: key }) => setup.assumed?.has(key) === true)
    .map(({ package: key, version }) => assumedRelease(key, version, setup.core));
}

/**
 * A setup's releases as the modules taken as present leave them: a release of such a module is only the one standing
 * for it, and any version of it another release requires is the one present, as it is taken to be whatever is needed.
 * A dependency a module such as midi-qol pulls in, which hypothetical mode ignores, would otherwise make every release
 * requiring a newer version of it unusable.
 * @param releases - The releases
 * @param setup - The setup, with the modules taken as present
 * @returns The releases, without those of the modules taken as present, and asking any version of them
 */
function withAssumed(releases: readonly Release[], setup: Setup): Release[] {
  const { assumed } = setup;
  if (assumed === undefined || assumed.size === 0) return [...releases];
  const satisfied = (relationship: Relationship): Relationship =>
    assumed.has(packageKey(relationship.package)) ? { ...relationship, compatibility: {} } : relationship;
  return releases
    .filter(release => !assumed.has(packageKey(release.package)))
    .map(release =>
      release.relationships.requires.some(({ package: ref }) => assumed.has(packageKey(ref)))
        ? {
            ...release,
            relationships: { ...release.relationships, requires: release.relationships.requires.map(satisfied) },
          }
        : release,
    );
}

/**
 * What checking found, without the modules taken as present, which are never judged.
 * @param checks - What checking found
 * @param setup - The setup checked
 * @returns The checks of the other packages
 */
function judgedOf(checks: readonly ReleaseCheck[], setup: Setup): ReleaseCheck[] {
  return checks.filter(({ release }) => setup.assumed?.has(packageKey(release.package)) !== true);
}

/**
 * A setup with one module at another version, which is added if the setup has none of it.
 * @param setup - The setup
 * @param id - The module ID
 * @param version - Its version
 * @returns The new setup
 */
function withModule(setup: Setup, id: string, version: string): Setup {
  const key = packageKey({ type: 'module', id });
  return {
    ...setup,
    modules: [...setup.modules.filter(spec => spec.package !== key), { package: key, version }],
  };
}

/** Each package's releases found, by package key, with how many releases there were when they were indexed. */
const releaseIndexes = new WeakMap<
  readonly Release[],
  { readonly count: number; readonly byKey: Map<string, Release[]> }
>();

/**
 * The releases found, by package key: indexed once, and again only when a lookup has found more.
 * @param releases - The releases found
 * @returns Each package's releases, in the order found
 */
function releasesByKey(releases: readonly Release[]): ReadonlyMap<string, readonly Release[]> {
  const indexed = releaseIndexes.get(releases);
  if (indexed?.count === releases.length) return indexed.byKey;
  const byKey = Map.groupBy(releases, release => packageKey(release.package));
  releaseIndexes.set(releases, { count: releases.length, byKey });
  return byKey;
}

/**
 * Check every package of a setup at once, in a universe of what the check reads: the release of each package in the
 * setup at its chosen version, the first found as the check itself would find it, and every core build. With
 * Foundry's version order, the default, the other releases cannot change the answer, and in the catalogue's universe,
 * with every version of everything the setup needs, they would make each check slow.
 * @param catalogue - The releases found
 * @param setup - The setup
 * @returns What checking found of the system and each module whose release is known
 */
function checkSetup(catalogue: VersionCatalogue, setup: Setup): readonly ReleaseCheck[] {
  const byKey = releasesByKey(catalogue.releases);
  const releases = [setup.system, ...setup.modules].flatMap(({ package: key, version }) => {
    if (setup.assumed?.has(key) === true) return [];
    const release = byKey.get(key)?.find(candidate => sameVersion(candidate.version, version));
    return release === undefined ? [] : [release];
  });
  return check({ core: catalogue.cores, releases: [...withAssumed(releases, setup), ...assumedReleases(setup)] }, setup)
    .releases;
}

/**
 * Only what checking found of modules.
 * @param checked - What checking found
 * @returns The modules' checks
 */
function modulesOf(checked: readonly ReleaseCheck[]): ReleaseCheck[] {
  return checked.filter(({ release }) => release.package.type === 'module');
}

/**
 * Whether a package's version is not on Foundry's package listing.
 * @param catalogue - The releases found
 * @param key - The package
 * @param version - Its version
 * @returns `true` for a release marked unlisted
 */
function isUnlisted(catalogue: VersionCatalogue, key: string, version: string): boolean {
  return (
    releasesByKey(catalogue.releases)
      .get(key)
      ?.find(release => sameVersion(release.version, version))?.unlisted === true
  );
}

/**
 * A version, marked when it is not on Foundry's package listing, with a word on it in its badge's tooltip and text.
 * Foundry's users cannot install it from the listing, so a GM should choose it knowingly.
 * @param option - The version, with its badge
 * @param unlisted - Whether it is not on the listing
 * @returns The version, marked if it is not
 */
function withListing(option: VersionOption, unlisted: boolean): VersionOption {
  if (!unlisted) return option;
  const note = localize('MONDARTH-EMMA.Versions.Unlisted');
  const { badge } = option;
  return {
    ...option,
    unlisted: true,
    badge:
      badge === null
        ? null
        : {
            ...badge,
            tooltip: `${badge.tooltip}<br>${foundry.utils.escapeHTML(note)}`,
            text: `${badge.text} ${note}`,
          },
  };
}

/**
 * A version, marked when it was found without a manifest URL for it alone and is not the one in use, with a word on it
 * in its badge's tooltip and text. EMMA could not install it, so it cannot be chosen.
 * @param catalogue - The releases found
 * @param key - The package
 * @param option - The version, with its badge
 * @returns The version, marked if it has no manifest of its own
 */
function withManifest(catalogue: VersionCatalogue, key: string, option: VersionOption): VersionOption {
  const { version } = option;
  const inUse =
    key === catalogue.base.system.package
      ? catalogue.base.system.version
      : catalogue.installed.get(key.slice(key.indexOf(':') + 1));
  if (inUse !== undefined && sameVersion(inUse, version)) return option;
  const release = releasesByKey(catalogue.releases)
    .get(key)
    ?.find(found => sameVersion(found.version, version));
  if (release === undefined || !missingManifest(release)) return option;
  const note = localize('MONDARTH-EMMA.Versions.NoManifest');
  const { badge } = option;
  return {
    ...option,
    missingManifest: true,
    badge:
      badge === null
        ? null
        : {
            ...badge,
            tooltip: `${badge.tooltip}<br>${foundry.utils.escapeHTML(note)}`,
            text: `${badge.text} ${note}`,
          },
  };
}

/**
 * A package's version, with the badge Foundry gives its release with a verdict.
 * @param checked - What checking found of the release
 * @param setup - What checking found of every package in the same setup
 * @returns The version and its badge
 */
function optionOf(checked: ReleaseCheck, setup: readonly ReleaseCheck[]): VersionOption {
  const { release } = checked;
  return withListing({ version: release.version, badge: releaseBadge(checked, setup) }, release.unlisted === true);
}

/** How badly each colour of badge fits, worst last; a package with no badge fits. */
const MISFIT: readonly VersionBadge['type'][] = ['success', 'neutral', 'warning', 'error'];

/**
 * How well a setup fits, as a badge for the version of the core or system that makes it: the worst badge of the
 * system and its modules, naming those that will not work and those that may not.
 * @param catalogue - The releases found
 * @param setup - The setup
 * @param version - The version the badge is for
 * @returns The version, with the setup's badge
 */
function fitOf(catalogue: VersionCatalogue, setup: Setup, version: string): VersionOption {
  const checks = checkSetup(catalogue, setup);
  const judged = judgedOf(checks, setup).map(checked => ({
    title: catalogue.titles.get(packageKey(checked.release.package)) ?? checked.release.package.id,
    badge: optionOf(checked, checks).badge,
  }));
  const misfit = (badge: VersionBadge | null) => (badge === null ? 0 : MISFIT.indexOf(badge.type));
  const worst = judged.reduce<VersionBadge | null>(
    (found, { badge }) => (misfit(badge) > misfit(found) ? badge : found),
    null,
  );
  const named = (fits: (badge: VersionBadge | null) => boolean) =>
    judged.filter(({ badge }) => fits(badge)).map(({ title }) => title);
  const lines = [
    { key: 'MONDARTH-EMMA.Versions.Fit.Unusable', titles: named(badge => badge?.type === 'error') },
    {
      key: 'MONDARTH-EMMA.Versions.Fit.Unverified',
      titles: named(badge => badge?.type === 'warning' || badge?.type === 'neutral'),
    },
  ].filter(({ titles }) => titles.length > 0);
  const say = (written: (title: string) => string) =>
    lines.map(({ key, titles }) => format(key, { packages: formatList(titles.map(written)) }));
  const text = lines.length === 0 ? localize('MONDARTH-EMMA.Versions.Fit.Verified') : say(title => title).join(' ');
  return {
    version,
    badge: {
      type: worst?.type ?? 'success',
      icon: worst?.icon ?? 'fa-solid fa-code-branch',
      tooltip: lines.length === 0 ? text : say(title => foundry.utils.escapeHTML(title)).join('<br>'),
      text,
    },
  };
}

/**
 * The badge each module of a setup gets at its version.
 * @param catalogue - The releases found
 * @param setup - The setup
 * @returns The version and its badge, keyed by module ID; none for a module whose release is not known
 */
function judgeChoices(catalogue: VersionCatalogue, setup: Setup): Map<string, VersionOption> {
  const checks = checkSetup(catalogue, setup);
  return new Map(modulesOf(judgedOf(checks, setup)).map(found => [found.release.package.id, optionOf(found, checks)]));
}

/**
 * The badge each of a module's versions would get, with the other modules at their versions in a setup.
 * @param catalogue - The releases found
 * @param setup - The setup
 * @param versions - The module's versions to judge
 * @param id - The module ID
 * @returns Each version, in the order given, with its badge
 */
function judgeVersions(
  catalogue: VersionCatalogue,
  setup: Setup,
  versions: readonly string[],
  id: string,
): VersionOption[] {
  return versions.flatMap(version => {
    const checks = checkSetup(catalogue, withModule(setup, id, version));
    const found = modulesOf(checks).find(({ release }) => release.package.id === id);
    // Every version listed has a release, so is always found.
    return found === undefined
      ? []
      : [withManifest(catalogue, packageKey({ type: 'module', id }), optionOf(found, checks))];
  });
}
