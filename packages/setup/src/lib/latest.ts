/**
 * Packages whose authors publish only a "latest" manifest: one URL, such as `releases/latest/download/module.json` or a
 * file on a branch, that always gives the newest version, with a download that may be just as changeable. No URL names
 * any one version, so the resolver finds none to install from (see its `missingManifest`), and EMMA could neither
 * install nor update them.
 *
 * Until EMMA's catalogue keeps a copy of each version, a "latest" manifest is taken as installable at the version it
 * declares, for the one release that can be what it gives now: the newest loaded from it, and, where Foundry's index
 * lists the package, at the version the index gives. Older releases loaded from it are not what it gives now, so stay
 * without one: the history of such a package is only the version installed and the latest. Pure: it works on plain
 * values only.
 */
import type { PackageKey, Release } from '@mondarth/fvtt-resolver';

import type { KitResolver } from '@mondarth/emma-core/setup-kit';

import { newerIn } from './setups';

/**
 * Give the release a "latest" manifest gives now that manifest as its own.
 * @param resolver - The resolver
 * @param releases - The releases found
 * @param index - The newest version of each package Foundry's index lists, by key; a package not in it is not checked
 * @returns The releases, the one each "latest" manifest gives now with it as its own manifest
 */
export function acceptLatest(
  resolver: KitResolver,
  releases: readonly Release[],
  index: ReadonlyMap<PackageKey, string>,
): Release[] {
  const newer = newerIn(resolver);
  const latestOf = (release: Release) => `${resolver.packageKey(release.package)} ${release.manifest ?? ''}`;
  // The newest release loaded from each manifest URL, of each package.
  const newest = new Map<string, Release>();
  for (const release of releases) {
    if (release.manifest === undefined || release.detail !== 'loaded') continue;
    const held = newest.get(latestOf(release));
    if (held === undefined || newer(release.version, held.version)) newest.set(latestOf(release), release);
  }
  return releases.map(release => {
    if (release.versionManifest !== undefined || release.manifest === undefined) return release;
    if (newest.get(latestOf(release)) !== release) return release;
    const listed = index.get(resolver.packageKey(release.package));
    if (listed !== undefined && !resolver.sameVersion(listed, release.version)) return release;
    return { ...release, versionManifest: release.manifest };
  });
}

/**
 * Add what each installed package's own manifest gives now, as Foundry's updater reads it when it updates the package:
 * a version Foundry's listing, or EMMA's catalogue, does not have yet, as one published by its manifest alone. That
 * version is what Foundry installs from the manifest, so it is taken as listed, installable from it; one already found
 * keeps what else was found of it.
 * @param resolver - The resolver
 * @param releases - The releases found
 * @param current - The releases the installed packages' manifests give now, read this session
 * @returns The releases, with the current ones among them
 */
export function withCurrent(
  resolver: KitResolver,
  releases: readonly Release[],
  current: readonly Release[],
): Release[] {
  const key = (release: Release) => resolver.packageKey(release.package);
  const currentOf = (release: Release) =>
    current.find(given => key(given) === key(release) && resolver.sameVersion(given.version, release.version));
  const known = releases.map(release => {
    const given = currentOf(release);
    if (given === undefined) return release;
    const { unlisted, ...listed } = release;
    if (unlisted !== true && release.versionManifest !== undefined) return release;
    const own = release.versionManifest ?? given.versionManifest ?? given.manifest;
    return { ...listed, ...(own !== undefined && { versionManifest: own }) };
  });
  const added = current
    .filter(given => !releases.some(release => currentOf(release) === given))
    .map(given => {
      const own = given.versionManifest ?? given.manifest;
      return { ...given, ...(own !== undefined && { versionManifest: own }) };
    });
  return [...known, ...added];
}
