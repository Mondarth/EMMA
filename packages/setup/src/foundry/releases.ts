/**
 * One of the two places the EMMA extension fetches, with `listing.ts`: the releases of the installed game systems and modules, and of any it
 * means to install, from EMMA's package catalogue alone, as its version 2 gives them (see `catalogueSet` in
 * `@mondarth/fvtt-resolver/sources`): one lookup for the installed packages, with everything they need, how fresh
 * each is, and Foundry's builds. Nothing else is asked, so a browser needs no proxy: the catalogue sends CORS headers.
 *
 * When the catalogue cannot be asked, as in a build without one, or reached, only what is installed is known, so it
 * is all kept as it is, and every package is unreached.
 *
 * The resolver and its sources are the ones the setup kit gives, from the installed EMMA module (see
 * `@mondarth/emma-core/setup-kit`).
 */
import type { CoreChannel, CoreRelease, PackageKey, PackageRef, Release, Universe } from '@mondarth/fvtt-resolver';
import type { CatalogueSet, LocalManifest } from '@mondarth/fvtt-resolver/sources';

import type { DefaultCatalogue } from '@mondarth/emma-core/default-catalogue';
import type { SetupKit } from '@mondarth/emma-core/setup-kit';

import { acceptLatest, withCurrent } from '../lib/latest';
import type { ReadManifest } from '../lib/updates';

import type { CoreBuild, InstalledManifests } from './setup-game';

/** The releases found, and how to load more as the resolver needs them. */
export interface ReleaseLookup {
  /** The installed Foundry build, and every release found of the installed systems and modules. */
  readonly universe: Universe;
  /** Load listed releases from their manifests, for `resolveInRounds`: the catalogue gives every release loaded. */
  readonly load: (needs: readonly Release[]) => Promise<readonly Release[]>;
  /**
   * Look up every release of more packages, as of one to install anew, with manifest URLs to find them by, as
   * Foundry's listing gives them: the catalogue finds a package it does not hold by them.
   */
  readonly lookUp: (
    packages: readonly PackageRef[],
    manifests?: Readonly<Record<PackageKey, readonly string[]>>,
  ) => Promise<readonly Release[]>;
  /** Read a manifest the user gives, to install a package from, through the catalogue. */
  readonly readManifest: ReadManifest;
  /**
   * The packages the catalogue says cannot be had, archived or gone: only their installed releases are in the
   * universe, so they stay as they are.
   */
  readonly unavailable: ReadonlySet<PackageKey>;
  /**
   * The packages whose releases could not all be listed, so may have newer versions not found; every package, and
   * `core`, when the catalogue could not be reached.
   */
  readonly unreached: readonly PackageKey[];
}

/** How {@link lookUpReleases} fetches. */
export interface LookupOptions {
  /** The setup kit, from the installed EMMA module. */
  readonly kit: SetupKit;
  /** EMMA's package catalogue, with its key, or `null` for none, as in development builds. */
  readonly catalogue: DefaultCatalogue | null;
  /** The EMMA extension's version, named to the catalogue, so its logs can say which version asks; `null` for none. */
  readonly clientVersion?: string | null;
  /** Fetches; the browser's by default. */
  readonly fetch?: typeof globalThis.fetch;
}

const CHANNELS: readonly CoreChannel[] = ['stable', 'testing', 'development', 'prototype'];

/**
 * The installed Foundry build, as the resolver names it.
 * @param build - The build
 * @returns The core release
 */
function coreRelease(build: CoreBuild): CoreRelease {
  return {
    version: build.version,
    generation: build.generation,
    channel: CHANNELS.find(channel => channel === build.channel) ?? 'stable',
  };
}

/**
 * Whether a manifest URL is one the catalogue takes, a web address: it refuses a lookup that gives any other.
 * @param url - The URL
 * @returns Whether it is
 */
function isWebUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * The newest version each package's own manifest gives now, as the catalogue last read it, or else Foundry's listing,
 * against which a "latest" manifest's version is checked (see `lib/latest.ts`).
 * @param set - The catalogue, as a source set
 * @param releases - The releases found
 * @param packageKey - The resolver's package key
 * @returns The versions, by package key
 */
function newestOf(
  set: CatalogueSet,
  releases: readonly Release[],
  packageKey: (ref: PackageRef) => PackageKey,
): Map<PackageKey, string> {
  const newest = new Map<PackageKey, string>();
  for (const { package: ref } of releases) {
    const key = packageKey(ref);
    const held = set.packageOf(key);
    const version = held?.own.version ?? held?.latest ?? null;
    if (version !== null) newest.set(key, version);
  }
  return newest;
}

/**
 * Look up every release of the installed systems and modules.
 * @param installed - The installed packages' manifests, and the Foundry build
 * @param options - How to fetch
 * @returns What was found
 */
export async function lookUpReleases(installed: InstalledManifests, options: LookupOptions): Promise<ReleaseLookup> {
  const { kit, catalogue, clientVersion = null } = options;
  const { CORE, packageKey, sameVersion } = kit.resolver;
  const { catalogueSet, catalogueSource, localSource } = kit.sources;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const core = coreRelease(installed.core);
  const manifests: LocalManifest[] = installed.manifests.map(manifest => ({
    json: manifest.json,
    origin: manifest.origin,
    type: manifest.type,
  }));
  const local = localSource(manifests);
  const source =
    catalogue === null
      ? undefined
      : catalogueSource({
          ...catalogue,
          fetch: send,
          ...(clientVersion !== null && { client: `EMMA-extension/${clientVersion}` }),
        });
  // From the installed generation on: Foundry is never moved back, so nothing that runs only on an older one is chosen.
  const set = source === undefined ? undefined : catalogueSet({ catalogue: source, fromGeneration: core.generation });
  // A "latest" manifest is installable at the version it gives now, in each batch of releases found.
  const latest = (batch: readonly Release[]) =>
    set === undefined ? [...batch] : acceptLatest(kit.resolver, batch, newestOf(set, batch, packageKey));

  const refs: PackageRef[] = installed.manifests.map(({ type, id }) => ({ type, id }));
  // One lookup for every installed package, with the version installed and the manifest it was installed from.
  const found = await set?.lookUp(
    installed.manifests.map(({ type, id, version, manifest }) => ({
      type,
      id,
      installed: version,
      ...(manifest !== undefined && isWebUrl(manifest) && { manifest }),
    })),
  );
  const releases = found?.universe.releases ?? [];
  const reached = set?.gaps().length === 0;
  const builds = [core, ...(found?.universe.core ?? []).filter(({ version }) => !sameVersion(version, core.version))];
  // The catalogue gives nothing of a package that cannot be had, or that it does not hold yet, and a version only
  // installed here may be one it has not seen: the installed release is added from its manifest.
  const missing = await Promise.all(
    installed.manifests.map(async ({ type, id, version }) => {
      const key = packageKey({ type, id });
      const given = releases.some(
        release => packageKey(release.package) === key && sameVersion(release.version, version),
      );
      if (given) return [];
      const read = await local.releases({ type, id });
      return read.ok ? read.value : [];
    }),
  );
  // What each installed package's own manifest gives now, as the catalogue last read it, as Foundry's updater reads it:
  // a version published by the manifest alone is installable from that manifest. One the catalogue does not hold yet
  // is pending there, so is not known here.
  const current = installed.manifests.flatMap(({ type, id, manifest }) => {
    const key = packageKey({ type, id });
    const own = set?.packageOf(key)?.own.version ?? null;
    if (manifest === undefined || own === null) return [];
    const release = releases.find(given => packageKey(given.package) === key && sameVersion(given.version, own));
    return release === undefined ? [] : [{ ...release, manifest }];
  });
  const unavailable = new Set((set?.unavailable() ?? []).map(({ package: ref }) => packageKey(ref)));
  const unreached = reached
    ? set
        .unreached()
        .map(packageKey)
        .filter(key => refs.some(ref => packageKey(ref) === key))
    : [...refs.map(packageKey), CORE];

  return {
    universe: {
      core: builds,
      releases: latest(withCurrent(kit.resolver, [...releases, ...missing.flat()], current)),
    },
    load: () => Promise.resolve([]),
    lookUp: async (packages, more = {}) => {
      if (set === undefined) return [];
      const asked = await set.lookUp(
        packages.map(({ type, id }) => {
          const manifest = more[packageKey({ type, id })]?.find(isWebUrl);
          return { type, id, ...(manifest !== undefined && { manifest }) };
        }),
      );
      return latest(asked.universe.releases);
    },
    readManifest: async (url, type) => {
      const read = await source?.manifest(url, type);
      if (read === undefined || !read.ok) return { ok: false, problem: 'no-catalogue' };
      const { value } = read;
      if (!value.ok) return value;
      // The user's URL is the version's own manifest: what it gives is what they chose.
      return { ok: true, title: value.title, release: { ...value.release, manifest: url, versionManifest: url } };
    },
    unavailable,
    unreached,
  };
}
