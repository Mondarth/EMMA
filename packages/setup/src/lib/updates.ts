/**
 * Which installed packages the EMMA extension's standard mode offers updates for, and to which versions. Foundry
 * installs one version of each package, which every world that uses it shares, so a version is offered only if it is
 * safe for each of them:
 *
 * - for each recorded world, the resolver finds the best setup of the installed Foundry build, the world's game system
 *   and the modules its record says are active, each free to move up to a newer version, never down;
 * - a package that recorded worlds use is offered the newest version all of them accept: the lowest of their bests. A
 *   world no setup is found for accepts only what is installed;
 * - a package no recorded world uses, such as a module active in no recorded world, or a system only worlds without a
 *   record use, is offered its newest version that the installed Foundry build can run.
 *
 * The Foundry build itself is kept: no newer one is found without a proxy. Pure but for the resolver's loading.
 */
import type { PackageKey, Policy, Release, Universe } from '@mondarth/fvtt-resolver';
import {
  CORE,
  AVAILABILITY,
  coreAvailability,
  isNewerVersion,
  isUnavailable,
  looksLikePrerelease,
  packageKey,
  resolveInRounds,
  sameVersion,
} from '@mondarth/fvtt-resolver';

import type { Overview } from './overview';

/** An installed package with newer versions on offer. */
export interface PackageUpdate {
  readonly key: PackageKey;
  readonly installed: string;
  /** The newest version offered. */
  readonly newest: string;
  /** The versions that may be chosen, newest first: those found from the newest offered down to the installed one. */
  readonly versions: readonly string[];
}

/** What the search found. */
export interface UpdateSearch {
  /** The installed packages with newer versions on offer, by package key. */
  readonly updates: ReadonlyMap<PackageKey, PackageUpdate>;
  /** The IDs of the recorded worlds no setup was found for, so that nothing they use is offered an update. */
  readonly unresolved: readonly string[];
}

/** What the search works on. */
export interface UpdateInputs {
  readonly overview: Overview;
  /** The installed Foundry build, and every release found of the installed systems and modules. */
  readonly universe: Universe;
  /** Load listed releases from their manifests, as the resolver needs them. */
  readonly load: (needs: readonly Release[]) => Promise<readonly Release[]>;
}

/**
 * How the best setup is found, as the module's hypothetical mode finds it: a module's `verified` core is no limit, the
 * systems it names must be met, and a release that declares no core compatibility, which Foundry cannot place, is not
 * chosen.
 */
const BEST_VERSIONS_POLICY: Partial<Policy> = {
  verified: 'ignore',
  systemCompatibility: 'require',
  missingCompatibility: 'reject',
};

/**
 * Find the updates on offer.
 * @param inputs - The installation, and the releases found
 * @returns The updates, and the worlds no setup was found for
 */
export async function findUpdates(inputs: UpdateInputs): Promise<UpdateSearch> {
  const { overview, load } = inputs;
  const installed = new Map<PackageKey, string>([
    ...overview.systems.map(({ id, version }) => [packageKey({ type: 'system', id }), version] as const),
    ...overview.modules.map(({ module: { id, version } }) => [packageKey({ type: 'module', id }), version] as const),
  ]);
  let universe = atLeastInstalled(inputs.universe, installed);

  // The best version each world that uses a package accepts.
  const accepted = new Map<PackageKey, string[]>();
  const accept = (key: PackageKey, version: string): void => {
    accepted.set(key, [...(accepted.get(key) ?? []), version]);
  };
  const unresolved: string[] = [];
  for (const world of overview.worlds) {
    if (world.record === undefined || world.system === undefined) continue;
    const used = [
      packageKey({ type: 'system', id: world.system.id }),
      ...world.modules
        .filter(({ installed: version }) => version !== undefined)
        .map(({ id }) => packageKey({ type: 'module', id })),
    ];
    const rounds = await resolveInRounds(
      universe,
      { require: used.map(key => ({ package: key })), pins: [{ package: CORE, version: overview.core }] },
      load,
      { policy: BEST_VERSIONS_POLICY },
    );
    // What was loaded is kept for the next world, which may well need it too.
    universe = atLeastInstalled(rounds.universe, installed);
    const { resolution } = rounds;
    if (resolution.ok) {
      for (const release of [resolution.setup.system, ...resolution.setup.modules])
        accept(packageKey(release.package), release.version);
    } else {
      unresolved.push(world.world.id);
      for (const key of used) {
        const version = installed.get(key);
        if (version !== undefined) accept(key, version);
      }
    }
  }

  const updates = new Map<PackageKey, PackageUpdate>();
  for (const [key, version] of installed) {
    const choosable = newestFirst(
      universe.releases.filter(
        release => packageKey(release.package) === key && runsOn(release, overview.core, universe),
      ),
    );
    const bests = accepted.get(key);
    const newest = bests === undefined ? choosable[0] : oldest(bests);
    if (newest === undefined || !newer(newest, version)) continue;
    // The newest offered is a release the resolver chose, which may be one not offered on its own, such as an unlisted
    // version when no listed one fits.
    const between = choosable.filter(offered => newer(newest, offered) && newer(offered, version));
    const versions = unique([newest, ...between, version]);
    updates.set(key, { key, installed: version, newest, versions });
  }
  return { updates, unresolved };
}

/**
 * The universe without releases older than the installed ones: an update never goes back.
 * @param universe - The universe
 * @param installed - The installed version of each installed package, by key
 * @returns The universe, without them
 */
function atLeastInstalled(universe: Universe, installed: ReadonlyMap<PackageKey, string>): Universe {
  return {
    core: universe.core,
    releases: universe.releases.filter(release => {
      const version = installed.get(packageKey(release.package));
      return version === undefined || !newer(version, release.version);
    }),
  };
}

/**
 * Whether a release may be offered on its own: one the Foundry build can run by the core compatibility it declares,
 * listed, and not a pre-release, as the resolver's policy has it.
 * @param release - The release
 * @param core - The Foundry build
 * @param universe - The universe, for the builds known
 * @returns `true` if it may be offered
 */
function runsOn(release: Release, core: string, universe: Universe): boolean {
  const availability = coreAvailability({ ...release.compatibility, ...release.listing }, core, universe.core);
  return (
    availability !== AVAILABILITY.UNKNOWN &&
    !isUnavailable(availability) &&
    release.unlisted !== true &&
    !looksLikePrerelease(release.version)
  );
}

/**
 * The versions of some releases, newest first, each once.
 * @param releases - The releases
 * @returns Their versions
 */
function newestFirst(releases: readonly Release[]): string[] {
  return unique(releases.map(({ version }) => version).sort((a, b) => Number(newer(b, a)) - Number(newer(a, b))));
}

/**
 * The oldest of some versions.
 * @param versions - The versions, at least one
 * @returns The oldest
 */
function oldest(versions: readonly string[]): string | undefined {
  return versions.reduce<string | undefined>(
    (lowest, version) => (lowest === undefined || newer(lowest, version) ? version : lowest),
    undefined,
  );
}

/**
 * Some versions, each once, as the resolver counts `v1.0.0` and `1.0.0` as one.
 * @param versions - The versions, in order
 * @returns The first of each
 */
function unique(versions: readonly string[]): string[] {
  return versions.filter((version, index) => versions.findIndex(other => sameVersion(other, version)) === index);
}

/**
 * Whether Foundry counts one version as newer than another, a leading `v` aside.
 * @param a - A version
 * @param b - Another
 * @returns Whether `a` is newer
 */
function newer(a: string, b: string): boolean {
  const unprefixed = (version: string) => version.replace(/^[vV](?=\d)/, '');
  return isNewerVersion(unprefixed(a), unprefixed(b));
}
