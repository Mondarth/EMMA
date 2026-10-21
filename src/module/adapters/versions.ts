/**
 * The only place EMMA looks up the versions of the packages in use, for hypothetical mode. It asks
 * `@mondarth/fvtt-resolver` for every release of the system and the active modules, then judges a version of a module
 * by checking the setup it would make, with the core, the system and the other modules' chosen versions. The verdict
 * becomes the badge Foundry's own `Module.getVersionBadge` gives it, so the colours and tooltips are Foundry's.
 *
 * Browsers may not read Foundry's package listing or the manifests attached to GitHub releases, as neither sends
 * CORS headers. Without a proxy only GitHub's and GitLab's release lists, which do, the installed manifests, and
 * manifests on other sites that send CORS headers are read; a version known only from a release list declares no
 * compatibility, so Foundry judges it unknown.
 */
import type {
  CoreChannel,
  CoreRelease,
  PackageVersion,
  ReleaseCheck,
  Relationship,
  Release,
  SetupSpec,
} from '@mondarth/fvtt-resolver';
import { check, isNewerVersion, packageKey } from '@mondarth/fvtt-resolver';
import type { Cache as SourceCache, LocalManifest, ReleaseSource } from '@mondarth/fvtt-resolver/sources';
import {
  foundryIndexSource,
  githubSource,
  gitlabSource,
  httpClient,
  localSource,
  manifestUrlSource,
  memoryCache,
  sourceSet,
} from '@mondarth/fvtt-resolver/sources';

import type { VersionBadge } from './modules';
import { toBadge } from './modules';

/** A package, by type and ID. */
export interface PackageRef {
  readonly type: 'module' | 'system' | 'world';
  readonly id: string;
}

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
  /**
   * Look up the versions of installed modules, and of the system the first time. Modules already looked up, and IDs
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
}

/** The releases found so far, and what is needed to judge them. */
interface VersionCatalogue {
  /** Every release found, of the system and the modules. */
  readonly releases: readonly Release[];
  /** The versions installed of every installed module, keyed by module ID. */
  readonly installed: ReadonlyMap<string, string>;
  /** The core and system in use. */
  readonly base: Omit<SetupSpec, 'modules'>;
  /** The core release in use. */
  readonly core: CoreRelease;
}

/** The versions chosen for modules, keyed by module ID; a module not given is at its installed version. */
export type VersionChoices = ReadonlyMap<string, string>;

/** Where a proxy URL template puts the URL it fetches. */
const PLACEHOLDER = '{url}';

/** The most requests one lookup makes, to stay within GitHub's limit of 60 an hour without a proxy. */
const MAX_REQUESTS = 300;

const CHANNELS: readonly CoreChannel[] = ['stable', 'testing', 'development', 'prototype'];

// Kept for the session, so reopening EMMA or turning hypothetical mode on again does not fetch it all again.
const sessionCache = memoryCache();

/** How {@link createVersionJudge} fetches. */
export interface FindOptions {
  /** A CORS proxy URL template containing `{url}`, or `null` to fetch directly. */
  readonly proxy: string | null;
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
 * Send requests through a proxy.
 * @param send - The fetch to send them with
 * @param proxy - The proxy URL template, containing `{url}`
 * @returns A fetch that asks the proxy for each URL
 */
function throughProxy(send: typeof globalThis.fetch, proxy: string): typeof globalThis.fetch {
  return (input, init) => send(proxy.replace(PLACEHOLDER, encodeURIComponent(urlOf(input))), init);
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
  const { proxy, cache = sessionCache } = options;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const http = httpClient({
    fetch: proxy === null ? direct(send) : throughProxy(send, proxy),
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

  const catalogue = {
    releases: [] as Release[],
    installed: new Map(installed.map(pkg => [pkg.id, pkg.version])),
    base: {
      core: core.version,
      system: { package: packageKey({ type: 'system', id: system.id }), version: system.version },
    },
    core,
  };
  // Only versions with a release, which every version found has, and the installed one does unless its manifest
  // could not be read; such a module is left at its installed version, unjudged.
  const versions = new Map<string, string[]>();
  const asked = new Set<string>();
  const unreached: PackageRef[] = [];

  return {
    get unreached() {
      return [...unreached];
    },
    async lookUp(ids) {
      const refs: PackageRef[] = [
        { type: 'system' as const, id: system.id },
        ...[...ids].filter(id => catalogue.installed.has(id)).map(id => ({ type: 'module' as const, id })),
      ].filter(ref => !asked.has(packageKey(ref)));
      if (refs.length === 0) return;
      for (const ref of refs) asked.add(packageKey(ref));
      const known = set.gaps().length;
      let releases: readonly Release[];
      try {
        ({ releases } = await set.universe(refs));
      } catch (error: unknown) {
        // Asked again next time.
        for (const ref of refs) asked.delete(packageKey(ref));
        throw error;
      }
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
    judgeChoices: (active, choices) => judgeChoices(catalogue, setupOf(catalogue, active, choices)),
    judgeVersions: (active, choices, id) =>
      judgeVersions(catalogue, setupOf(catalogue, active, choices), choosable(catalogue, versions, id), id),
  };
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
function setupOf(catalogue: VersionCatalogue, active: Iterable<string>, choices: VersionChoices): Map<string, string> {
  return new Map(
    [...active].flatMap(id => {
      const installed = catalogue.installed.get(id);
      return installed === undefined ? [] : [[id, choices.get(id) ?? installed] as const];
    }),
  );
}

/**
 * Check every module of a setup at once.
 * @param catalogue - The releases found
 * @param modules - The version of each module, keyed by module ID
 * @returns What checking found of each module whose release is known
 */
function checkSetup(catalogue: VersionCatalogue, modules: ReadonlyMap<string, string>): ReleaseCheck[] {
  const universe = { core: [catalogue.core], releases: catalogue.releases };
  const specs: PackageVersion[] = [...modules].map(([id, version]) => ({
    package: packageKey({ type: 'module', id }),
    version,
  }));
  return check(universe, { ...catalogue.base, modules: specs }).releases.filter(
    ({ release }) => release.package.type === 'module',
  );
}

/**
 * A module's version, with the badge Foundry gives its release with a verdict.
 * @param checked - What checking found of the release
 * @returns The version and its badge
 */
function optionOf(checked: ReleaseCheck): VersionOption {
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
  return { version: release.version, badge: toBadge(foundry.packages.Module.getVersionBadge(code, data, {})) };
}

/**
 * The badge each module of a setup gets at its version.
 * @param catalogue - The releases found
 * @param modules - The version of each module, keyed by module ID
 * @returns The version and its badge, keyed by module ID; none for a module whose release is not known
 */
function judgeChoices(catalogue: VersionCatalogue, modules: ReadonlyMap<string, string>): Map<string, VersionOption> {
  const checked = checkSetup(catalogue, modules);
  return new Map(checked.map(found => [found.release.package.id, optionOf(found)]));
}

/**
 * The badge each of a module's versions would get, with the other modules at their versions in a setup.
 * @param catalogue - The releases found
 * @param modules - The version of each module, keyed by module ID
 * @param versions - The module's versions to judge
 * @param id - The module ID
 * @returns Each version, in the order given, with its badge
 */
function judgeVersions(
  catalogue: VersionCatalogue,
  modules: ReadonlyMap<string, string>,
  versions: readonly string[],
  id: string,
): VersionOption[] {
  return versions.flatMap(version => {
    const found = checkSetup(catalogue, new Map([...modules, [id, version]])).find(
      ({ release }) => release.package.id === id,
    );
    // Every version listed has a release, so is always found.
    return found === undefined ? [] : [optionOf(found)];
  });
}
