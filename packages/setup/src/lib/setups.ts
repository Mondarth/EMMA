/**
 * What the update search and the plans share: which packages a world uses, the order of versions as Foundry counts it,
 * and whether a release may be offered on a Foundry build. Pure.
 */
import type { PackageKey, Relationship, Release, Universe } from '@mondarth/fvtt-resolver';

import type { KitResolver } from '@mondarth/emma-core/setup-kit';

import type { Overview } from './overview';
import { isIgnored } from './overview';

/** A package a world uses, at its installed version. */
export interface Use {
  readonly key: PackageKey;
  readonly installed: string;
}

/** The packages a world uses. */
export interface WorldUses {
  readonly system: Use;
  readonly modules: readonly Use[];
}

/**
 * What a world uses, as its record says: its game system, then the installed modules it runs.
 * @param resolver - The resolver
 * @param world - The world
 * @returns Its packages, or `undefined` for a world without a record, or whose system is not installed
 */
export function usedBy(resolver: KitResolver, world: Overview['worlds'][number]): WorldUses | undefined {
  if (world.record === undefined || world.system === undefined) return undefined;
  const { packageKey } = resolver;
  return {
    system: { key: packageKey({ type: 'system', id: world.system.id }), installed: world.system.version },
    modules: world.modules.flatMap(({ id, installed }) =>
      installed === undefined ? [] : [{ key: packageKey({ type: 'module', id }), installed }],
    ),
  };
}

/**
 * Whether a release may be offered on its own: one the Foundry build can run by the core compatibility it declares,
 * listed, and not a pre-release, as the resolver's policy has it.
 * @param resolver - The resolver
 * @param release - The release
 * @param core - The Foundry build
 * @param universe - The universe, for the builds known
 * @returns `true` if it may be offered
 */
export function runsOn(resolver: KitResolver, release: Release, core: string, universe: Universe): boolean {
  const { AVAILABILITY, coreAvailability, isUnavailable, looksLikePrerelease } = resolver;
  const availability = coreAvailability({ ...release.compatibility, ...release.listing }, core, universe.core);
  return (
    availability !== AVAILABILITY.UNKNOWN &&
    !isUnavailable(availability) &&
    release.unlisted !== true &&
    !looksLikePrerelease(release.version)
  );
}

/**
 * Some versions, newest first, each once.
 * @param resolver - The resolver
 * @param versions - The versions
 * @returns The versions, in order
 */
export function newestFirst(resolver: KitResolver, versions: readonly string[]): string[] {
  const newer = newerIn(resolver);
  return unique(
    resolver,
    [...versions].sort((a, b) => Number(newer(b, a)) - Number(newer(a, b))),
  );
}

/**
 * The oldest of some versions.
 * @param resolver - The resolver
 * @param versions - The versions, at least one
 * @returns The oldest
 */
export function oldest(resolver: KitResolver, versions: readonly string[]): string | undefined {
  const newer = newerIn(resolver);
  return versions.reduce<string | undefined>(
    (lowest, version) => (lowest === undefined || newer(lowest, version) ? version : lowest),
    undefined,
  );
}

/**
 * Some versions, each once, as the resolver counts `v1.0.0` and `1.0.0` as one.
 * @param resolver - The resolver
 * @param versions - The versions, in order
 * @returns The first of each
 */
export function unique(resolver: KitResolver, versions: readonly string[]): string[] {
  return versions.filter(
    (version, index) => versions.findIndex(other => resolver.sameVersion(other, version)) === index,
  );
}

/**
 * Whether Foundry counts one version as newer than another, a leading `v` aside.
 * @param resolver - The resolver
 * @returns Whether its first version is newer than its second
 */
export function newerIn(resolver: KitResolver): (a: string, b: string) => boolean {
  const unprefixed = (version: string) => version.replace(/^[vV](?=\d)/, '');
  return (a, b) => resolver.isNewerVersion(unprefixed(a), unprefixed(b));
}

/**
 * Keeps the packages locked in Foundry as they are, as Foundry refuses to update or uninstall them: their installed
 * releases alone may be chosen.
 * @param resolver - The resolver
 * @param overview - The installation
 * @returns Whether a release may be chosen: one of a package not locked, or the locked one's installed release
 */
export function keepsLocked(resolver: KitResolver, overview: Overview): (release: Release) => boolean {
  const locked = new Map<PackageKey, string>([
    ...overview.systems
      .filter(({ locked: isLocked }) => isLocked === true)
      .map(({ id, version }) => [resolver.packageKey({ type: 'system', id }), version] as const),
    ...overview.modules
      .filter(({ module: { locked: isLocked } }) => isLocked === true)
      .map(({ module: { id, version } }) => [resolver.packageKey({ type: 'module', id }), version] as const),
  ]);
  return release => {
    const version = locked.get(resolver.packageKey(release.package));
    return version === undefined || resolver.sameVersion(version, release.version);
  };
}

/** What the plans take into account of an installation, and of the releases found, leaving out what EMMA ignores. */
export interface Considered {
  /** The installation without the worlds EMMA ignores: their setups hold nothing back. */
  readonly overview: Overview;
  /**
   * Releases as the plans take them: none of a package EMMA ignores, and any version of one asked for satisfied by the
   * one installed.
   */
  readonly releases: (releases: readonly Release[]) => Release[];
  /** The releases the packages EMMA ignores stand as: at their installed versions, asking nothing. */
  readonly standIns: readonly Release[];
}

/**
 * What the plans take into account, as the EMMA module's hypothetical mode takes a module it ignores, but for worlds and
 * game systems too. A package ignored is taken as present at its installed version, its other releases never looked up
 * or judged, so that it never changes, asks nothing of the setup, and satisfies whatever version of it another asks.
 * @param resolver - The resolver
 * @param overview - The installation, with what EMMA ignores
 * @returns What the plans take into account
 */
export function considered(resolver: KitResolver, overview: Overview): Considered {
  const { packageKey } = resolver;
  const installed = [
    ...overview.systems.map(({ id, version }) => ({ type: 'system' as const, id, version })),
    ...overview.modules.map(({ module: { id, version } }) => ({ type: 'module' as const, id, version })),
  ].filter(({ type, id }) => isIgnored(overview, `${type}:${id}`));
  const ignored = new Set(installed.map(ref => packageKey(ref)));
  const satisfied = (relationship: Relationship): Relationship =>
    ignored.has(packageKey(relationship.package)) ? { ...relationship, compatibility: {} } : relationship;
  return {
    overview: { ...overview, worlds: overview.worlds.filter(({ world }) => !isIgnored(overview, `world:${world.id}`)) },
    releases: releases =>
      releases
        .filter(release => !ignored.has(packageKey(release.package)))
        .map(release => ({
          ...release,
          relationships: {
            ...release.relationships,
            requires: release.relationships.requires.map(satisfied),
            systems: release.relationships.systems.map(satisfied),
          },
        })),
    // It declares the installed build's compatibility rather than none, as the policy refuses a release declaring none.
    standIns: installed.map(({ type, id, version }) => ({
      package: { type, id },
      version,
      compatibility: { minimum: overview.core, verified: overview.core },
      relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
      protected: false,
      origin: `${type}s/${id}/${type}.json`,
      detail: 'loaded',
    })),
  };
}

/**
 * The game systems and modules the worlds use, which the best versions may be limited to: each world's system, recorded
 * or not, and the modules a recorded world runs or will need. A world without a record may run others.
 * @param overview - The installation
 * @returns Their keys, such as `system:dnd5e` and `module:dice`
 */
export function inUse(overview: Overview): ReadonlySet<string> {
  return new Set([
    ...overview.worlds.flatMap(({ system }) => (system === undefined ? [] : [`system:${system.id}`])),
    ...overview.modules.flatMap(({ module: { id }, worlds }) => (worlds.length === 0 ? [] : [`module:${id}`])),
  ]);
}
