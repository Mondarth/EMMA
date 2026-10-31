/**
 * What the update search and the plans share: which packages a world uses, the order of versions as Foundry counts it,
 * and whether a release may be offered on a Foundry build. Pure.
 */
import type { PackageKey, Release, Universe } from '@mondarth/fvtt-resolver';

import type { KitResolver } from '@mondarth/emma-core/setup-kit';

import type { Overview } from './overview';

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
