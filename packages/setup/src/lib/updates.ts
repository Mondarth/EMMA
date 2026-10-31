/**
 * Which installed packages the EMMA extension's standard mode offers updates for, and to which versions. Foundry
 * installs one version of each package, which every world that uses it shares, so a version is offered only if it is
 * safe for each of them:
 *
 * - for each recorded world, the resolver finds the best setup of the installed Foundry build, the world's game system
 *   and the modules its record says are active, each free to move up to a newer version, never down;
 * - a package that recorded worlds use is offered the newest version all of them accept: the lowest of their bests. A
 *   world no setup is found for accepts only what is installed;
 * - a game system a world without a record uses is offered no update, as EMMA cannot tell whether that world's modules
 *   would work with one;
 * - a package no recorded world uses, such as a module active in no recorded world, is offered its newest version that
 *   the installed Foundry build can run.
 *
 * Foundry VTT itself is offered the newest build every world can take: each recorded world's best setup with the build
 * free to move up too, a world without a record the newest build its installed system runs on, and a world no setup is
 * found for the installed build. The packages are offered versions for the installed build, so a version that needs a
 * newer one is not offered yet. Foundry's builds are known only through EMMA's proxy; without it, only the installed
 * one is, so it is kept.
 *
 * A newer version that is not offered is blocked, with the worlds that hold it back and why, or the Foundry build it
 * needs, so that EMMA can say so rather than leave it unseen.
 *
 * Each version offered is badged as the EMMA module's hypothetical mode badges it, with
 * EMMA's verdict rather than Foundry's: in each recorded world that uses the package, with the other packages at the
 * versions chosen, keeping the worst; a package no recorded world uses, by the Foundry build alone.
 *
 * Pure but for the resolver's loading, and the badges, which are Foundry's. The resolver and the badges are the ones the
 * setup kit gives, from the installed EMMA module (see `@mondarth/emma-core/setup-kit`).
 */
import type { PackageKey, Policy, Release, ReleaseCheck, SetupSpec, Universe } from '@mondarth/fvtt-resolver';

import type { KitBadge, KitBadges, KitResolver } from '@mondarth/emma-core/setup-kit';

import { format, localize } from './i18n';
import type { Planner, UpdateHold } from './plans';
import { createPlanner } from './plans';
import type { Use, WorldUses } from './setups';
import { newerIn, newestFirst, oldest, runsOn, unique, usedBy } from './setups';

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
  /**
   * Why the plan cannot take the version as it is: the choices in it that would have to be taken out, by title, and why,
   * in the resolver's words. Such a version cannot be chosen until they are.
   */
  readonly conflict?: {
    readonly remove: readonly { readonly title: string; readonly version: string }[];
    readonly explanation: readonly string[];
  };
  /** What the version needs, as its manifest declares it, one sentence to a line. */
  readonly needs?: readonly string[];
  /** What else choosing it would change, beyond what is chosen already: each package by its title, at its version. */
  readonly brings?: readonly { readonly title: string; readonly version: string }[];
  /** When more than one recorded world uses the package, the badge it has in each, of which {@link badge} is the worst. */
  readonly worlds?: readonly { readonly title: string; readonly badge: KitBadge | null }[];
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

export type { UpdateHold } from './plans';

/** An installed package, or Foundry VTT itself, with a newer version that EMMA cannot offer. */
export interface BlockedUpdate {
  readonly key: PackageKey;
  /** The newest version found, which is not offered. */
  readonly newest: string;
  /** The worlds that hold it back, in the order of the installation's worlds. */
  readonly holds: readonly UpdateHold[];
  /** The oldest Foundry build the newest version runs on, when that is newer than the installed one. */
  readonly needsCore?: string;
  /** Why the newest version, with what it needs, cannot be had, in the resolver's words, one sentence to a line. */
  readonly explanation?: readonly string[];
}

/** What the search found. */
export interface UpdateSearch {
  /** The installed packages with newer versions on offer, by package key. */
  readonly updates: ReadonlyMap<PackageKey, PackageUpdate>;
  /** The installed packages with a newer version EMMA cannot offer, by package key; some may have an update too. */
  readonly blocked: ReadonlyMap<PackageKey, BlockedUpdate>;
  /** The IDs of the recorded worlds no setup was found for, so that nothing they use is offered an update. */
  readonly unresolved: readonly string[];
  /** Badges the versions on offer. */
  readonly judge: VersionJudge;
  /** Plans the versions chosen, with what they need. */
  readonly planner: Planner;
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
  const { CORE, packageKey, resolveInRounds, sameVersion } = resolver;
  const newer = newerIn(resolver);
  const core = overview.core;
  // The channels of Foundry's builds that may be chosen: the stable one, and the installed build's.
  const channel = inputs.universe.core.find(build => sameVersion(build.version, core))?.channel ?? 'stable';
  const policy: Partial<Policy> = { ...BEST_VERSIONS_POLICY, coreChannels: [...new Set(['stable' as const, channel])] };
  const installed = new Map<PackageKey, string>([
    ...overview.systems.map(({ id, version }) => [packageKey({ type: 'system', id }), version] as const),
    ...overview.modules.map(({ module: { id, version } }) => [packageKey({ type: 'module', id }), version] as const),
  ]);
  const atLeastInstalled = (from: Universe): Universe => ({
    // An update never goes back.
    core: from.core.filter(build => !newer(core, build.version)),
    releases: from.releases.filter(release => {
      const version = installed.get(packageKey(release.package));
      return version === undefined || !newer(version, release.version);
    }),
  });
  let universe = atLeastInstalled(inputs.universe);

  // The best version each world that uses a package accepts, and why, should it be less than the newest.
  const accepted = new Map<PackageKey, { version: string; hold: UpdateHold }[]>();
  const accept = (key: PackageKey, version: string, hold: UpdateHold): void => {
    accepted.set(key, [...(accepted.get(key) ?? []), { version, hold }]);
  };
  const unresolved: string[] = [];
  for (const world of overview.worlds) {
    const { id, title } = world.world;
    const uses = usedBy(resolver, world);
    if (uses === undefined) {
      // Without a record, only the world's system is known: it stays as it is.
      if (world.record === undefined && world.system !== undefined) {
        const key = packageKey({ type: 'system', id: world.system.id });
        accept(key, world.system.version, { reason: 'unrecorded', world: { id, title } });
      }
      continue;
    }
    const used = [uses.system, ...uses.modules].map(({ key }) => key);
    const rounds = await resolveInRounds(
      universe,
      { require: used.map(key => ({ package: key })), pins: [{ package: CORE, version: overview.core }] },
      load,
      { policy },
    );
    // What was loaded is kept for the next world, which may well need it too.
    universe = atLeastInstalled(rounds.universe);
    const { resolution } = rounds;
    if (resolution.ok) {
      for (const release of [resolution.setup.system, ...resolution.setup.modules])
        accept(packageKey(release.package), release.version, { reason: 'inconsistent', world: { id, title } });
    } else {
      unresolved.push(id);
      for (const key of used) {
        const version = installed.get(key);
        if (version !== undefined) accept(key, version, { reason: 'unresolved', world: { id, title } });
      }
    }
  }

  const updates = new Map<PackageKey, PackageUpdate>();
  const blocked = new Map<PackageKey, BlockedUpdate>();

  // Foundry VTT itself: the newest build each world can take, with everything it uses free to move up too.
  const builds = newestFirst(
    resolver,
    universe.core.filter(build => policy.coreChannels?.includes(build.channel) === true).map(({ version }) => version),
  );
  if (builds.length > 1) {
    const cores: { version: string; hold: UpdateHold }[] = [];
    for (const world of overview.worlds) {
      const { id, title } = world.world;
      const uses = usedBy(resolver, world);
      const unrecorded = world.record === undefined;
      // A world whose system is not installed cannot run, whatever the build.
      if (world.system === undefined) continue;
      // Without a record, only the world's system is known, and it stays as it is.
      const system = packageKey({ type: 'system', id: world.system.id });
      const requirements =
        uses === undefined
          ? { require: [{ package: system }], pins: [{ package: system, version: world.system.version }] }
          : { require: [uses.system, ...uses.modules].map(({ key }) => ({ package: key })) };
      const rounds = await resolveInRounds(universe, requirements, load, { policy });
      universe = atLeastInstalled(rounds.universe);
      const { resolution } = rounds;
      const reason = unrecorded ? 'unrecorded' : resolution.ok ? 'inconsistent' : 'unresolved';
      cores.push({ version: resolution.ok ? resolution.setup.core : core, hold: { reason, world: { id, title } } });
    }
    const newest =
      cores.length === 0
        ? builds[0]
        : oldest(
            resolver,
            cores.map(({ version }) => version),
          );
    const available = builds[0];
    if (available !== undefined && newest !== undefined && newer(available, newest)) {
      const holds = cores.filter(({ version }) => newer(available, version)).map(({ hold }) => hold);
      blocked.set(CORE, { key: CORE, newest: available, holds });
    }
    if (newest !== undefined && newer(newest, core)) {
      const versions = builds.filter(build => !newer(build, newest));
      updates.set(CORE, { key: CORE, installed: core, newest, versions });
    }
  }

  for (const [key, version] of installed) {
    const choosable = newestFirst(
      resolver,
      universe.releases
        .filter(release => packageKey(release.package) === key && runsOn(resolver, release, core, universe))
        .map(release => release.version),
    );
    const bests = accepted.get(key);
    const newest =
      bests === undefined
        ? choosable[0]
        : oldest(
            resolver,
            bests.map(({ version: best }) => best),
          );
    const available = choosable[0];
    if (available !== undefined && newer(available, newest ?? version) && newer(available, version)) {
      const holds = (bests ?? []).filter(({ version: best }) => newer(available, best)).map(({ hold }) => hold);
      blocked.set(key, { key, newest: available, holds });
    }
    // A newer version still, that only a newer Foundry build runs: not offered until that build is installed.
    const later = laterBuild(resolver, universe, key, builds, available ?? newest ?? version);
    if (later !== undefined) blocked.set(key, { key, newest: later.version, holds: [], needsCore: later.core });
    if (newest === undefined || !newer(newest, version)) continue;
    // The newest offered is a release the resolver chose, which may be one not offered on its own, such as an unlisted
    // version when no listed one fits.
    const between = choosable.filter(offered => newer(newest, offered) && newer(offered, version));
    const versions = unique(resolver, [newest, ...between, version]);
    updates.set(key, { key, installed: version, newest, versions });
  }
  // A newer version that is not offered on its own may be, with what it needs changed too.
  const planner = createPlanner({ resolver, overview, universe, load, policy, coreTitle: localize('Tree.Root') });
  for (const [key, block] of [...blocked]) {
    const completion = await planner.complete(new Map([[key, block.newest]]));
    if (completion.ok) {
      const from = installed.get(key) ?? core;
      const offered = updates.get(key)?.versions ?? [from];
      updates.set(key, {
        key,
        installed: from,
        newest: block.newest,
        versions: unique(resolver, [block.newest, ...offered]),
      });
      blocked.delete(key);
    } else {
      const { hold, explanation = [] } = completion;
      const holds =
        hold === undefined || block.holds.some(({ world }) => world.id === hold.world.id)
          ? block.holds
          : [...block.holds, hold];
      blocked.set(key, { ...block, holds, ...(explanation.length > 0 && { explanation }) });
    }
  }
  return { updates, blocked, unresolved, judge: judgeIn({ resolver, badges, overview, planner }), planner };
}

/** How badly each colour of badge fits, worst last; a version with no badge fits, as in the EMMA module. */
const MISFIT: readonly KitBadge['type'][] = ['success', 'neutral', 'warning', 'error'];

/**
 * Badge the versions of the installed packages, as the EMMA module's hypothetical mode does.
 * @param inputs - The resolver and the badges, the installation, and every release found
 * @param inputs.resolver - The resolver
 * @param inputs.badges - How the EMMA module badges a version
 * @param inputs.overview - The installation
 * @param inputs.planner - The planner, for every release found, with those loaded since
 * @returns The judge
 */
function judgeIn(inputs: {
  resolver: KitResolver;
  badges: KitBadges;
  overview: Overview;
  planner: Planner;
}): VersionJudge {
  const { resolver, badges, overview, planner } = inputs;
  const { AVAILABILITY, CORE, check, coreAvailability, packageKey, sameVersion } = resolver;
  const misfit = (badge: KitBadge | null) => (badge === null ? 0 : MISFIT.indexOf(badge.type));
  const worlds = overview.worlds.flatMap(world => {
    const uses = usedBy(resolver, world);
    return uses === undefined ? [] : [{ title: world.world.title, uses }];
  });
  const titles = new Map<PackageKey, string>([
    ...overview.systems.map(({ id, title }) => [packageKey({ type: 'system', id }), title] as const),
    ...overview.modules.map(({ module: { id, title } }) => [packageKey({ type: 'module', id }), title] as const),
  ]);
  const releaseOf = (key: PackageKey, version: string) =>
    planner.universe.releases.find(
      release => packageKey(release.package) === key && sameVersion(release.version, version),
    );
  /**
   * A world's setup, with one package at a version and everything else at the version chosen.
   * @param uses - What the world uses
   * @param key - The package
   * @param version - Its version
   * @param chosen - The versions chosen
   * @returns The setup
   */
  const setupOf = (
    uses: WorldUses,
    key: PackageKey,
    version: string,
    chosen: (key: PackageKey) => string | undefined,
  ): SetupSpec => {
    const at = (use: Use) => ({
      package: use.key,
      version: use.key === key ? version : (chosen(use.key) ?? use.installed),
    });
    const core = key === CORE ? version : (chosen(CORE) ?? overview.core);
    return { core, system: at(uses.system), modules: uses.modules.map(at) };
  };

  /**
   * A build of Foundry VTT, badged by how well every recorded world's packages fit it, as the EMMA module badges a
   * build: the worst of their badges, naming those that will not work with it and those that are not verified.
   * @param version - The build
   * @param chosen - The versions chosen
   * @returns The build, with its badge; none without a recorded world
   */
  const coreOption = (version: string, chosen: (key: PackageKey) => string | undefined): VersionOption => {
    const judged = worlds.flatMap(({ uses }) => {
      const { releases } = check(planner.universe, setupOf(uses, CORE, version, chosen));
      return releases.map(found => ({
        key: packageKey(found.release.package),
        badge: badges.releaseBadge(found, releases),
      }));
    });
    const worst = judged.reduce<KitBadge | null>(
      (found, { badge }) => (misfit(badge) > misfit(found) ? badge : found),
      null,
    );
    if (judged.length === 0) return { version, badge: null };
    const named = (fits: (badge: KitBadge | null) => boolean) => [
      ...new Set(judged.filter(({ badge }) => fits(badge)).map(({ key }) => titles.get(key) ?? key)),
    ];
    const lines = [
      { key: 'Update.CoreUnusable', titles: named(badge => badge?.type === 'error') },
      { key: 'Update.CoreUnverified', titles: named(badge => badge?.type === 'warning' || badge?.type === 'neutral') },
    ]
      .filter(({ titles: list }) => list.length > 0)
      .map(({ key, titles: list }) => format(key, { packages: list.join(', ') }));
    const text = lines.length === 0 ? localize('Update.CoreFits') : lines.join(' ');
    const type = worst?.type ?? 'success';
    const icon = worst?.icon ?? 'fa-solid fa-code-branch';
    return { version, badge: { type, icon, tooltip: lines.map(escapeHtml).join('<br>') || escapeHtml(text), text } };
  };

  return (key, version, chosen) => {
    if (key === CORE) return coreOption(version, chosen);
    const release = releaseOf(key, version);
    if (release === undefined) return { version, badge: null };
    const users = worlds.filter(({ uses }) => [uses.system, ...uses.modules].some(use => use.key === key));
    let badge: KitBadge | null;
    let perWorld: { title: string; badge: KitBadge | null }[] | undefined;
    if (users.length === 0) {
      // No recorded world says what it would run with: the Foundry build alone judges it.
      const availability = coreAvailability(
        { ...release.compatibility, ...release.listing },
        chosen(CORE) ?? overview.core,
        planner.universe.core,
      );
      const checked: ReleaseCheck = { release, availability, broken: [], missed: [], advisories: [] };
      badge = availability === AVAILABILITY.UNKNOWN ? null : badges.releaseBadge(checked, [checked]);
    } else {
      // In each world that uses it, with everything else at the version chosen; the worst, saying where.
      const judged = users.map(({ title, uses }) => {
        const { releases } = check(planner.universe, setupOf(uses, key, version, chosen));
        const found = releases.find(({ release: candidate }) => packageKey(candidate.package) === key);
        return { title, badge: found === undefined ? null : badges.releaseBadge(found, releases) };
      });
      const worst = judged.reduce((found, next) => (misfit(next.badge) > misfit(found.badge) ? next : found));
      badge =
        users.length > 1 && worst.badge !== null
          ? withNote(worst.badge, format('Update.JudgedIn', { world: worst.title }))
          : worst.badge;
      if (users.length > 1) perWorld = judged;
    }
    const each = perWorld === undefined ? {} : { worlds: perWorld };
    if (release.unlisted !== true) return { version, badge, ...each };
    return {
      version,
      unlisted: true,
      badge: badge === null ? null : withNote(badge, localize('Update.Unlisted')),
      ...each,
    };
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
 * A package's newest version that only a Foundry build newer than the installed one runs, if it is newer than a version.
 * @param resolver - The resolver
 * @param universe - The releases found, and Foundry's builds from the installed one up
 * @param key - The package
 * @param builds - Foundry's builds that may be chosen, newest first, the installed one last
 * @param than - The version it must be newer than
 * @returns The version, and the oldest build that runs it; `undefined` if there is none
 */
function laterBuild(
  resolver: KitResolver,
  universe: Universe,
  key: PackageKey,
  builds: readonly string[],
  than: string,
): { version: string; core: string } | undefined {
  const newer = newerIn(resolver);
  const installed = builds.at(-1);
  const newerBuilds = builds.slice(0, -1).reverse();
  for (const version of newestFirst(
    resolver,
    universe.releases
      .filter(release => resolver.packageKey(release.package) === key && newer(release.version, than))
      .filter(release => installed === undefined || !runsOn(resolver, release, installed, universe))
      .map(release => release.version),
  )) {
    const release = universe.releases.find(
      candidate => resolver.packageKey(candidate.package) === key && candidate.version === version,
    );
    const build = release && newerBuilds.find(candidate => runsOn(resolver, release, candidate, universe));
    if (build !== undefined) return { version, core: build };
  }
  return undefined;
}
