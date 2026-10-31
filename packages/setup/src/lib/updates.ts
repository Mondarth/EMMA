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
 * The Foundry build itself is kept. Each version offered is badged as the EMMA module's hypothetical mode badges it, with
 * EMMA's verdict rather than Foundry's: in each recorded world that uses the package, with the other packages at the
 * versions chosen, keeping the worst; a package no recorded world uses, by the Foundry build alone.
 *
 * Pure but for the resolver's loading, and the badges, which are Foundry's. The resolver and the badges are the ones the
 * setup kit gives, from the installed EMMA module (see `@mondarth/emma-core/setup-kit`).
 */
import type { PackageKey, Policy, Release, ReleaseCheck, SetupSpec, Universe } from '@mondarth/fvtt-resolver';

import type { KitBadge, KitBadges, KitResolver } from '@mondarth/emma-core/setup-kit';

import { format, localize } from './i18n';

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

/** A version of a package, with EMMA's badge for it. */
export interface VersionOption {
  readonly version: string;
  /** The badge, or `null` for none, as for a release not found. */
  readonly badge: KitBadge | null;
  /** Whether the version is not on Foundry's package listing; the badge's tooltip and text say so already. */
  readonly unlisted?: true;
}

/**
 * Badge a version of a package.
 * @param key - The package
 * @param version - The version
 * @param chosen - The version chosen of each package, the installed one if none is
 * @returns The version, with its badge
 */
export type VersionJudge = (
  key: PackageKey,
  version: string,
  chosen: (key: PackageKey) => string | undefined,
) => VersionOption;

/** What the search found. */
export interface UpdateSearch {
  /** The installed packages with newer versions on offer, by package key. */
  readonly updates: ReadonlyMap<PackageKey, PackageUpdate>;
  /** The IDs of the recorded worlds no setup was found for, so that nothing they use is offered an update. */
  readonly unresolved: readonly string[];
  /** Badges the versions on offer. */
  readonly judge: VersionJudge;
}

/** What the search works on. */
export interface UpdateInputs {
  /** The resolver, from the setup kit. */
  readonly resolver: KitResolver;
  /** How the EMMA module badges a version, from the setup kit. */
  readonly badges: KitBadges;
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
  const { resolver, badges, overview, load } = inputs;
  const { CORE, packageKey, resolveInRounds } = resolver;
  const newer = newerIn(resolver);
  const installed = new Map<PackageKey, string>([
    ...overview.systems.map(({ id, version }) => [packageKey({ type: 'system', id }), version] as const),
    ...overview.modules.map(({ module: { id, version } }) => [packageKey({ type: 'module', id }), version] as const),
  ]);
  const atLeastInstalled = (from: Universe): Universe => ({
    core: from.core,
    // An update never goes back.
    releases: from.releases.filter(release => {
      const version = installed.get(packageKey(release.package));
      return version === undefined || !newer(version, release.version);
    }),
  });
  let universe = atLeastInstalled(inputs.universe);

  // The best version each world that uses a package accepts.
  const accepted = new Map<PackageKey, string[]>();
  const accept = (key: PackageKey, version: string): void => {
    accepted.set(key, [...(accepted.get(key) ?? []), version]);
  };
  const unresolved: string[] = [];
  for (const world of overview.worlds) {
    const uses = usedBy(resolver, world);
    if (uses === undefined) continue;
    const used = [uses.system, ...uses.modules].map(({ key }) => key);
    const rounds = await resolveInRounds(
      universe,
      { require: used.map(key => ({ package: key })), pins: [{ package: CORE, version: overview.core }] },
      load,
      { policy: BEST_VERSIONS_POLICY },
    );
    // What was loaded is kept for the next world, which may well need it too.
    universe = atLeastInstalled(rounds.universe);
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
      resolver,
      universe.releases.filter(
        release => packageKey(release.package) === key && runsOn(resolver, release, overview.core, universe),
      ),
    );
    const bests = accepted.get(key);
    const newest = bests === undefined ? choosable[0] : oldest(resolver, bests);
    if (newest === undefined || !newer(newest, version)) continue;
    // The newest offered is a release the resolver chose, which may be one not offered on its own, such as an unlisted
    // version when no listed one fits.
    const between = choosable.filter(offered => newer(newest, offered) && newer(offered, version));
    const versions = unique(resolver, [newest, ...between, version]);
    updates.set(key, { key, installed: version, newest, versions });
  }
  return { updates, unresolved, judge: judgeIn({ resolver, badges, overview, universe }) };
}

/** A package a world uses, at its installed version. */
interface Use {
  readonly key: PackageKey;
  readonly installed: string;
}

/** The packages a world uses. */
interface WorldUses {
  readonly system: Use;
  readonly modules: readonly Use[];
}

/**
 * What a world uses, as its record says: its game system, then the installed modules it runs.
 * @param resolver - The resolver
 * @param world - The world
 * @returns Its packages, or `undefined` for a world without a record, or whose system is not installed
 */
function usedBy(resolver: KitResolver, world: Overview['worlds'][number]): WorldUses | undefined {
  if (world.record === undefined || world.system === undefined) return undefined;
  const { packageKey } = resolver;
  return {
    system: { key: packageKey({ type: 'system', id: world.system.id }), installed: world.system.version },
    modules: world.modules.flatMap(({ id, installed }) =>
      installed === undefined ? [] : [{ key: packageKey({ type: 'module', id }), installed }],
    ),
  };
}

/** How badly each colour of badge fits, worst last; a version with no badge fits, as in the EMMA module. */
const MISFIT: readonly KitBadge['type'][] = ['success', 'neutral', 'warning', 'error'];

/**
 * Badge the versions of the installed packages, as the EMMA module's hypothetical mode does.
 * @param inputs - The resolver and the badges, the installation, and every release found
 * @param inputs.resolver - The resolver
 * @param inputs.badges - How the EMMA module badges a version
 * @param inputs.overview - The installation
 * @param inputs.universe - Every release found, as the search left it
 * @returns The judge
 */
function judgeIn(inputs: {
  resolver: KitResolver;
  badges: KitBadges;
  overview: Overview;
  universe: Universe;
}): VersionJudge {
  const { resolver, badges, overview, universe } = inputs;
  const { AVAILABILITY, check, coreAvailability, packageKey, sameVersion } = resolver;
  const misfit = (badge: KitBadge | null) => (badge === null ? 0 : MISFIT.indexOf(badge.type));
  const worlds = overview.worlds.flatMap(world => {
    const uses = usedBy(resolver, world);
    return uses === undefined ? [] : [{ title: world.world.title, uses }];
  });
  const releaseOf = (key: PackageKey, version: string) =>
    universe.releases.find(release => packageKey(release.package) === key && sameVersion(release.version, version));

  return (key, version, chosen) => {
    const release = releaseOf(key, version);
    if (release === undefined) return { version, badge: null };
    const users = worlds.filter(({ uses }) => [uses.system, ...uses.modules].some(use => use.key === key));
    let badge: KitBadge | null;
    if (users.length === 0) {
      // No recorded world says what it would run with: the Foundry build alone judges it.
      const availability = coreAvailability(
        { ...release.compatibility, ...release.listing },
        overview.core,
        universe.core,
      );
      const checked: ReleaseCheck = { release, availability, broken: [], missed: [], advisories: [] };
      badge = availability === AVAILABILITY.UNKNOWN ? null : badges.releaseBadge(checked, [checked]);
    } else {
      // In each world that uses it, with everything else at the version chosen; the worst, saying where.
      const at = (use: Use) => ({
        package: use.key,
        version: use.key === key ? version : (chosen(use.key) ?? use.installed),
      });
      const judged = users.map(({ title, uses }) => {
        const setup: SetupSpec = { core: overview.core, system: at(uses.system), modules: uses.modules.map(at) };
        const { releases } = check(universe, setup);
        const found = releases.find(({ release: candidate }) => packageKey(candidate.package) === key);
        return { title, badge: found === undefined ? null : badges.releaseBadge(found, releases) };
      });
      const worst = judged.reduce((found, next) => (misfit(next.badge) > misfit(found.badge) ? next : found));
      badge =
        users.length > 1 && worst.badge !== null
          ? withNote(worst.badge, format('Update.JudgedIn', { world: worst.title }))
          : worst.badge;
    }
    if (release.unlisted !== true) return { version, badge };
    return { version, unlisted: true, badge: badge === null ? null : withNote(badge, localize('Update.Unlisted')) };
  };
}

/**
 * A badge, with a line added to its tooltip and text.
 * @param badge - The badge
 * @param note - The line, as plain text
 * @returns The badge, with the line
 */
function withNote(badge: KitBadge, note: string): KitBadge {
  return { ...badge, tooltip: `${badge.tooltip}<br>${escapeHtml(note)}`, text: `${badge.text} ${note}` };
}

/**
 * Text, escaped to show as it is in HTML.
 * @param text - The text
 * @returns The HTML
 */
function escapeHtml(text: string): string {
  const entities: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => entities[char] ?? char);
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
function runsOn(resolver: KitResolver, release: Release, core: string, universe: Universe): boolean {
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
 * The versions of some releases, newest first, each once.
 * @param resolver - The resolver
 * @param releases - The releases
 * @returns Their versions
 */
function newestFirst(resolver: KitResolver, releases: readonly Release[]): string[] {
  const newer = newerIn(resolver);
  return unique(
    resolver,
    releases.map(({ version }) => version).sort((a, b) => Number(newer(b, a)) - Number(newer(a, b))),
  );
}

/**
 * The oldest of some versions.
 * @param resolver - The resolver
 * @param versions - The versions, at least one
 * @returns The oldest
 */
function oldest(resolver: KitResolver, versions: readonly string[]): string | undefined {
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
function unique(resolver: KitResolver, versions: readonly string[]): string[] {
  return versions.filter(
    (version, index) => versions.findIndex(other => resolver.sameVersion(other, version)) === index,
  );
}

/**
 * Whether Foundry counts one version as newer than another, a leading `v` aside.
 * @param resolver - The resolver
 * @returns Whether its first version is newer than its second
 */
function newerIn(resolver: KitResolver): (a: string, b: string) => boolean {
  const unprefixed = (version: string) => version.replace(/^[vV](?=\d)/, '');
  return (a, b) => resolver.isNewerVersion(unprefixed(a), unprefixed(b));
}
