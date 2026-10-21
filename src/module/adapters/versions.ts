/**
 * The only place EMMA looks up the versions of the packages in use, for hypothetical mode. It asks
 * `@mondarth/fvtt-resolver` for every release of the system and the active modules, then judges a version of a module
 * by checking the setup it would make, with the core, the system and the other modules' chosen versions. The verdict
 * becomes the badge Foundry's own `Module.getVersionBadge` gives it, so the colours and tooltips are Foundry's.
 *
 * The core and the system may be chosen too. A version of either is judged by how well the setup it would make fits:
 * by the worst badge it would leave the system or an active module with.
 *
 * Browsers may not read Foundry's package listing, its release notes or the manifests attached to GitHub releases, as
 * none sends CORS headers. Without a proxy only GitHub's and GitLab's release lists, which do, the installed manifests,
 * and manifests on other sites that send CORS headers are read, and no newer core is found; a version known only from
 * a release list declares no compatibility, so Foundry judges it unknown.
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
import { check, isNewerVersion, isUnavailable, packageKey } from '@mondarth/fvtt-resolver';
import type { Cache as SourceCache, LocalManifest, ReleaseSource } from '@mondarth/fvtt-resolver/sources';
import {
  foundryCoreReleases,
  foundryIndexSource,
  githubSource,
  gitlabSource,
  httpClient,
  localSource,
  manifestUrlSource,
  memoryCache,
  proxiedFetch,
  sourceSet,
} from '@mondarth/fvtt-resolver/sources';

import { format, formatList, localize } from '@module/lib/i18n';

import { explanationMessages } from './explanation';
import type { VersionBadge } from './modules';
import { toBadge } from './modules';
import type { PlanEntry, SetupCheck, SetupSolve } from './report';
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
}

/**
 * The versions found of the system and of the modules asked about, and how to judge them. Modules are looked up as
 * they are needed, as each lookup may cost requests GitHub limits to 60 an hour.
 */
export interface VersionJudge {
  /**
   * The packages whose versions could not all be fetched or read, so may be missing or judged on less than their
   * manifests declare.
   */
  readonly unreached: readonly PackageRef[];
  /** Whether it fetches through a proxy, without which it finds fewer versions and no newer core. */
  readonly proxied: boolean;
  /**
   * Look up the versions of installed modules, and of the core and the system the first time. Modules already looked up, and IDs
   * that are not installed modules, are skipped.
   * @param ids - The module IDs
   * @returns Once they are looked up; what could not be fetched is kept in {@link VersionJudge.unreached}
   */
  lookUp(ids: Iterable<string>): Promise<void>;
  /**
   * The versions of a module that may be chosen: the installed one and every newer one found.
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
}

/** A setup to check, always with its modules. */
type Setup = SetupSpec & { readonly modules: readonly PackageVersion[] };

/** The versions chosen; anything not given is at the version in use. */
export interface VersionChoices {
  /** The core version chosen. */
  readonly core?: string | undefined;
  /** The system version chosen. */
  readonly system?: string | undefined;
  /** The versions chosen for modules, keyed by module ID. */
  readonly modules: ReadonlyMap<string, string>;
}

/** The most requests one lookup makes, to stay within GitHub's limit of 60 an hour without a proxy. */
const MAX_REQUESTS = 300;

const CHANNELS: readonly CoreChannel[] = ['stable', 'testing', 'development', 'prototype'];

// Kept for the session, so reopening EMMA or turning hypothetical mode on again does not fetch it all again.
const sessionCache = memoryCache();

/** How {@link createVersionJudge} fetches. */
export interface FindOptions {
  /** A CORS proxy URL template containing `{url}`, or `null` to fetch directly. */
  readonly proxy: string | null;
  /** An API key to send the proxy, in an `X-API-Key` header, or `null` for none. Never sent without a proxy. */
  readonly apiKey?: string | null;
  /** Fetches; the browser's by default. */
  readonly fetch?: typeof globalThis.fetch;
  /** Where fetched data is kept; for the session by default. */
  readonly cache?: SourceCache;
}

/**
 * Hosts that send no CORS headers, so a browser cannot read what they answer: GitHub's release downloads and Foundry's
 * package listing. Without a proxy they are not asked at all, as each refused request also puts an error in the
 * console; the resolver records them as not reached.
 */
const NO_CORS_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'r2.foundryvtt.com',
  'foundryvtt.com',
]);

/**
 * The URL a request is for.
 * @param input - What fetch was given
 * @returns The URL
 */
function urlOf(input: RequestInfo | URL): string {
  // The resolver fetches by URL string; a request is read for its URL all the same.
  return input instanceof Request ? input.url : input.toString();
}

/**
 * Send requests directly, refusing those a browser could not read the answer to.
 * @param send - The fetch to send them with
 * @returns A fetch that refuses hosts that send no CORS headers
 */
function direct(send: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) =>
    NO_CORS_HOSTS.has(new URL(urlOf(input)).hostname)
      ? Promise.reject(new TypeError('Not fetched: the site sends no CORS headers'))
      : send(input, init);
}

/**
 * Send requests with an API key, for a proxy that asks for one.
 * @param send - The fetch to send them with
 * @param apiKey - The key, sent in an `X-API-Key` header
 * @returns A fetch that adds the key to every request
 */
function withApiKey(send: typeof globalThis.fetch, apiKey: string): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('X-API-Key', apiKey);
    return send(input, { ...init, headers });
  };
}

/**
 * Sort versions newest first, in Foundry's order.
 * @param versions - The versions
 * @returns A new array, newest first
 */
function newestFirst(versions: Iterable<string>): string[] {
  return [...versions].sort((a, b) => Number(isNewerVersion(b, a)) - Number(isNewerVersion(a, b)));
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
 * Set up looking up versions. Nothing is fetched until {@link VersionJudge.lookUp} is called.
 * @param options - How to fetch
 * @returns The judge, with nothing looked up yet
 */
export function createVersionJudge(options: FindOptions): VersionJudge {
  const { proxy, apiKey = null, cache = sessionCache } = options;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const http = httpClient({
    fetch: proxy === null ? direct(send) : proxiedFetch(apiKey === null ? send : withApiKey(send, apiKey), proxy),
    cache,
    budget: { maxRequests: MAX_REQUESTS },
  });
  const core = readCore();
  const system = game.system;
  const installed = Array.from(game.modules.values());

  const manifests: LocalManifest[] = [
    { json: system.toObject(), origin: `systems/${system.id}/system.json`, type: 'system' },
    ...installed.map(pkg => ({
      json: pkg.toObject(),
      origin: `modules/${pkg.id}/module.json`,
      type: 'module' as const,
    })),
  ];
  const declared = Object.fromEntries(
    [
      { key: packageKey({ type: 'system', id: system.id }), manifest: system.manifest },
      ...installed.map(pkg => ({ key: packageKey({ type: 'module', id: pkg.id }), manifest: pkg.manifest })),
    ].flatMap(({ key, manifest }) => (typeof manifest === 'string' && manifest !== '' ? [[key, [manifest]]] : [])),
  );
  const sources: ReleaseSource[] = [
    // The installed releases come first, as they are loaded with everything their manifests declare.
    localSource(manifests),
    // Only reachable through a proxy: Foundry's listing sends no CORS headers.
    ...(proxy === null ? [] : [foundryIndexSource(http)]),
    githubSource(http),
    gitlabSource(http),
    manifestUrlSource(http),
  ];
  // No core releases are given, so no version is left out for needing a newer core: it is shown, and judged so.
  const set = sourceSet({ sources, http, core: [], manifests: declared });

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
  };
  // Only versions with a release, which every version found has, and the installed one does unless its manifest
  // could not be read; such a module is left at its installed version, unjudged.
  const versions = new Map<string, string[]>();
  const asked = new Set<string>();
  const unreached: PackageRef[] = [];

  /**
   * Look up the core releases, through the proxy only: Foundry's release notes send no CORS headers.
   * @returns Whether they were found
   */
  async function lookUpCores(): Promise<boolean> {
    if (proxy === null) return true;
    const found = await foundryCoreReleases(http);
    if (!found.ok) return false;
    catalogue.cores.push(...found.value.filter(({ version }) => version !== core.version));
    return true;
  }

  return {
    proxied: proxy !== null,
    get unreached() {
      return [...unreached];
    },
    async lookUp(ids) {
      // The core releases are looked up with the system, the first time.
      const first = !asked.has(systemKey);
      const refs: ResolverRef[] = [
        { type: 'system' as const, id: system.id },
        ...[...ids].filter(id => catalogue.installed.has(id)).map(id => ({ type: 'module' as const, id })),
      ].filter(ref => !asked.has(packageKey(ref)));
      if (refs.length === 0) return;
      for (const ref of refs) asked.add(packageKey(ref));
      const known = set.gaps().length;
      let releases: readonly Release[];
      let cores: boolean;
      try {
        [{ releases }, cores] = await Promise.all([set.universe(refs), first ? lookUpCores() : true]);
      } catch (error: unknown) {
        // Asked again next time.
        for (const ref of refs) asked.delete(packageKey(ref));
        throw error;
      }
      if (!cores) unreached.push(CORE_REF);
      catalogue.releases.push(...releases);
      for (const release of releases.filter(({ package: { type } }) => type === 'module')) {
        versions.set(release.package.id, [...(versions.get(release.package.id) ?? []), release.version]);
      }
      const failed = new Set(
        set
          .gaps()
          .slice(known)
          .map(gap => gap.package),
      );
      unreached.push(...refs.filter(ref => failed.has(packageKey(ref))));
    },
    versionsOf: id => choosable(catalogue, versions, id),
    platformVersions: part => platformVersions(catalogue, part),
    judgeChoices: (active, choices) => judgeChoices(catalogue, setupOf(catalogue, active, choices)),
    judgeVersions: (active, choices, id) =>
      judgeVersions(catalogue, setupOf(catalogue, active, choices), choosable(catalogue, versions, id), id),
    judgePlatform: (active, choices, part) =>
      platformVersions(catalogue, part).map(version =>
        fitOf(catalogue, setupOf(catalogue, active, { ...choices, [part]: version }), version),
      ),
    reportCheck: (active, choices) =>
      checkReport(
        universeOf(catalogue),
        setupOf(catalogue, active, choices),
        messagesOf(catalogue),
        (checked, all) => optionOf(checked, all).badge,
      ),
    reportPlan: (active, choices) =>
      planReport(
        universeOf(catalogue),
        setupOf(catalogue, active, choices),
        messagesOf(catalogue),
        catalogue.installed,
      ),
    reportSolve: (active, choices) =>
      solveReport(
        universeOf(catalogue),
        setupOf(catalogue, active, choices),
        messagesOf(catalogue),
        set.load.bind(set),
      ),
  };
}

/**
 * The releases found, as the resolver reads them.
 * @param catalogue - The releases found
 * @returns The universe
 */
function universeOf(catalogue: VersionCatalogue): { core: readonly CoreRelease[]; releases: readonly Release[] } {
  return { core: catalogue.cores, releases: catalogue.releases };
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
 * The versions of a module that may be chosen: the installed one and every newer one.
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
  const installed = catalogue.installed.get(id) ?? '';
  return newestFirst((versions.get(id) ?? []).filter(version => !isNewerVersion(installed, version)));
}

/**
 * The modules of a setup at their chosen versions.
 * @param catalogue - The releases found
 * @param active - The IDs of the modules the setup has
 * @param choices - The versions chosen
 * @returns The version of each installed module of the setup, keyed by module ID
 */
function setupOf(catalogue: VersionCatalogue, active: Iterable<string>, choices: VersionChoices): Setup {
  const modules = [...active].flatMap(id => {
    const installed = catalogue.installed.get(id);
    const version = choices.modules.get(id) ?? installed;
    return version === undefined ? [] : [{ package: packageKey({ type: 'module', id }), version }];
  });
  const { core, system } = catalogue.base;
  return {
    core: choices.core ?? core,
    system: { package: system.package, version: choices.system ?? system.version },
    modules,
  };
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

/**
 * Check every package of a setup at once.
 * @param catalogue - The releases found
 * @param setup - The setup
 * @returns What checking found of the system and each module whose release is known
 */
function checkSetup(catalogue: VersionCatalogue, setup: SetupSpec): readonly ReleaseCheck[] {
  return check(universeOf(catalogue), setup).releases;
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
 * The packages of a setup, as Foundry's badges look them up to name the dependencies and systems a release does not
 * suit. Foundry would otherwise look in the modules installed and in `game.systems`, which exists only on the Setup
 * screen, so naming an unsuitable system would throw inside a world.
 * @param setup - What checking found of every package in the setup
 * @returns The setup's modules and system, for `getVersionBadge`'s options
 */
function packagesOf(setup: readonly ReleaseCheck[]): foundry.packages.ClientPackageMixin.GetVersionBadgeOptions {
  const collected = <T>(type: 'module' | 'system') =>
    new foundry.utils.Collection<T>(
      setup
        .filter(({ release }) => release.package.type === type)
        .map(({ release: { package: pkg, version }, availability }) => [
          pkg.id,
          // A stand-in for the installed package: Foundry reads only its version and whether it is unavailable.
          { id: pkg.id, version, unavailable: isUnavailable(availability) } as T,
        ]),
    );
  return {
    modules: collected<foundry.packages.Module>('module'),
    systems: collected<foundry.packages.System>('system'),
  };
}

/**
 * A package's version, with the badge Foundry gives its release with a verdict.
 * @param checked - What checking found of the release
 * @param setup - What checking found of every package in the same setup
 * @returns The version and its badge
 */
function optionOf(checked: ReleaseCheck, setup: readonly ReleaseCheck[]): VersionOption {
  const { release, availability } = checked;
  // Foundry reads only the IDs, types and bounds, to name the dependencies and systems a release does not suit.
  const related = ({ package: { id }, compatibility, manifest, reason }: Relationship) => ({
    id,
    compatibility,
    manifest,
    reason,
  });
  const data: foundry.packages.Module.ManifestData = {
    id: release.package.id,
    title: release.package.id,
    // Foundry reads it only to build the package; a version looked up is not installed, let alone active.
    active: false,
    version: release.version,
    compatibility: release.compatibility,
    relationships: {
      requires: release.relationships.requires.map(relation => ({ ...related(relation), type: relation.package.type })),
      systems: release.relationships.systems.map(relation => ({ ...related(relation), type: 'system' as const })),
    },
  };
  // The resolver's verdicts are Foundry's availability codes, as in 14.368.
  const code = availability as CONST.PACKAGE_AVAILABILITY_CODES;
  const packages = packagesOf(setup);
  const badge =
    release.package.type === 'system'
      ? foundry.packages.System.getVersionBadge(code, data as foundry.packages.System.ManifestData, packages)
      : foundry.packages.Module.getVersionBadge(code, data, packages);
  return { version: release.version, badge: toBadge(badge) };
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
function fitOf(catalogue: VersionCatalogue, setup: SetupSpec, version: string): VersionOption {
  const checks = checkSetup(catalogue, setup);
  const judged = checks.map(checked => ({
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
function judgeChoices(catalogue: VersionCatalogue, setup: SetupSpec): Map<string, VersionOption> {
  const checks = checkSetup(catalogue, setup);
  return new Map(modulesOf(checks).map(found => [found.release.package.id, optionOf(found, checks)]));
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
    return found === undefined ? [] : [optionOf(found, checks)];
  });
}
