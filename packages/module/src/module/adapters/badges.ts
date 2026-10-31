/**
 * How EMMA badges a version of a package: with the verdict its checks give the release, in the setup it would be in,
 * handed to Foundry's own `getVersionBadge`, so the colours, icons and explanations are Foundry's but the opinion is
 * EMMA's. Hypothetical mode's versions are badged this way, and so, through the setup kit, are the EMMA extension's on
 * the setup screen. Imports nothing of the module but plain values, as the setup kit is built from it.
 */
import type { ReleaseCheck, Relationship } from '@mondarth/fvtt-resolver';
import { isUnavailable } from '@mondarth/fvtt-resolver';

import type { VersionBadge } from './modules';
import { toBadge } from './modules';

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
 * The badge Foundry gives a release with a verdict: EMMA's opinion, in Foundry's colours.
 * @param checked - What checking found of the release
 * @param setup - What checking found of every package in the same setup
 * @returns The badge, or `null` if Foundry gives none
 */
export function releaseBadge(checked: ReleaseCheck, setup: readonly ReleaseCheck[]): VersionBadge | null {
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
  return toBadge(badge);
}
