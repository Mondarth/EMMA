/**
 * Coherent update plans. Foundry installs one version of each package, which every world that uses it shares, so a
 * version chosen may need others to change with it: a newer game system may need newer modules, and they a newer
 * Foundry build, and the other way round. A plan is the versions chosen, completed with every other change that each
 * world that uses them needs to keep working, as one set; when there is no such set, there is no plan.
 *
 * A set of choices is completed world by world:
 *
 * - each recorded world's setup is found with the choices pinned and everything else it uses preferred at its
 *   installed version, so that nothing changes that need not;
 * - a world without a record keeps its game system as it is, and the Foundry build must still run it;
 * - where worlds that share a package, or Foundry VTT itself, settle on different versions, the newest is pinned, as some
 *   world needs it, and every world is found again, until they agree or one has no setup;
 * - a version chosen of a package no recorded world uses must run on the Foundry build, which it moves up if need be.
 *
 * The resolver is the one the setup kit gives. Its loading of releases is kept for the next completion.
 */
import type { PackageKey, PackageVersion, Policy, Release, Requirements, Universe } from '@mondarth/fvtt-resolver';

import type { KitResolver } from '@mondarth/emma-core/setup-kit';

import type { Overview } from './overview';
import type { WorldUses } from './setups';
import { newerIn, newestFirst, runsOn, usedBy } from './setups';

/**
 * Why a world holds a package's update back:
 * - `unrecorded`: the world has no record, so which modules it runs, and whether they would work, is not known;
 * - `unresolved`: no working setup was found for the world at all, so nothing it uses moves;
 * - `inconsistent`: the world's other packages cannot all work with the newer version.
 */
export interface UpdateHold {
  readonly reason: 'unrecorded' | 'unresolved' | 'inconsistent';
  /** The world's ID and title. */
  readonly world: { readonly id: string; readonly title: string };
}

/** A set of choices, completed, or why it cannot be. */
export type Completion =
  | {
      readonly ok: true;
      /** Every package that changes, Foundry VTT among them, at its new version, by package key. */
      readonly versions: ReadonlyMap<PackageKey, string>;
    }
  | {
      readonly ok: false;
      /** The world that cannot work with the choices, when one is to blame. */
      readonly hold?: UpdateHold;
    };

/** A change in a plan. */
export interface PlanEntry {
  readonly key: PackageKey;
  readonly installed: string;
  readonly version: string;
  /** The choice that needs it; none for a version chosen. */
  readonly by?: PackageVersion;
}

/** Plans updates of an installation. */
export interface Planner {
  /** Every release found, with those loaded since. */
  readonly universe: Universe;
  /**
   * Complete a set of choices.
   * @param picks - The versions chosen, by package key; `core` for Foundry VTT
   * @returns The changes they need, or why there are none that work
   */
  complete(picks: ReadonlyMap<PackageKey, string>): Promise<Completion>;
  /**
   * Plan a set of choices: complete them, saying which choice needs each change it does not choose.
   * @param picks - The versions chosen, in the order they were chosen
   * @returns The changes, the choices first, or `undefined` if they cannot be completed
   */
  plan(picks: ReadonlyMap<PackageKey, string>): Promise<readonly PlanEntry[] | undefined>;
  /**
   * The versions of a package that may be chosen: those newer than the installed one, newest first, that are listed,
   * not pre-releases, and run on a Foundry build from the installed one up.
   * @param key - The package, or `core`
   * @returns The versions
   */
  candidates(key: PackageKey): readonly string[];
  /**
   * A package's title.
   * @param key - The package, or `core`
   * @returns Its title, or its key if it is not installed
   */
  titleOf(key: PackageKey): string;
}

/** What the planner works on. */
export interface PlannerInputs {
  readonly resolver: KitResolver;
  readonly overview: Overview;
  /** Every release found, from the installed versions up, and Foundry's builds from the installed one up. */
  readonly universe: Universe;
  readonly load: (needs: readonly Release[]) => Promise<readonly Release[]>;
  /** How setups are found, as the search finds them. */
  readonly policy: Partial<Policy>;
  /** Foundry VTT's title. */
  readonly coreTitle: string;
}

/**
 * The versions chosen, with one package's choice changed.
 * @param picks - The versions chosen, in the order they were chosen
 * @param key - The package
 * @param version - Its version, or `null` to take its choice back
 * @returns The versions chosen, a new choice last
 */
export function withChoice(
  picks: ReadonlyMap<PackageKey, string>,
  key: PackageKey,
  version: string | null,
): ReadonlyMap<PackageKey, string> {
  const changed = new Map(picks);
  if (version === null) changed.delete(key);
  else changed.set(key, version);
  return changed;
}

/**
 * Some of the versions chosen.
 * @param picks - The versions chosen, in the order they were chosen
 * @param keep - Whether to keep a package's choice
 * @returns The choices kept, in the same order
 */
export function keepChoices(
  picks: ReadonlyMap<PackageKey, string>,
  keep: (key: PackageKey, version: string) => boolean,
): ReadonlyMap<PackageKey, string> {
  return new Map([...picks].filter(([key, version]) => keep(key, version)));
}

/** The most times the worlds are found again before choices are given up as not settling. */
const MAX_ROUNDS = 8;

/**
 * Set up planning an installation's updates.
 * @param inputs - The installation, the releases found, and how setups are found
 * @returns The planner
 */
export function createPlanner(inputs: PlannerInputs): Planner {
  const { resolver, overview, load, policy } = inputs;
  const { CORE, packageKey, resolveInRounds, sameVersion } = resolver;
  const newer = newerIn(resolver);
  const core = overview.core;
  const installed = new Map<PackageKey, string>([
    [CORE, core],
    ...overview.systems.map(({ id, version }) => [packageKey({ type: 'system', id }), version] as const),
    ...overview.modules.map(({ module: { id, version } }) => [packageKey({ type: 'module', id }), version] as const),
  ]);
  const titles = new Map<PackageKey, string>([
    [CORE, inputs.coreTitle],
    ...overview.systems.map(({ id, title }) => [packageKey({ type: 'system', id }), title] as const),
    ...overview.modules.map(({ module: { id, title } }) => [packageKey({ type: 'module', id }), title] as const),
  ]);
  const recorded = overview.worlds.flatMap(world => {
    const uses = usedBy(resolver, world);
    return uses === undefined ? [] : [{ id: world.world.id, title: world.world.title, uses }];
  });
  const unrecorded = overview.worlds.flatMap(({ world, record, system }) =>
    record !== undefined || system === undefined
      ? []
      : [
          {
            id: world.id,
            title: world.title,
            system: packageKey({ type: 'system', id: system.id }),
            version: system.version,
          },
        ],
  );
  const channels = policy.coreChannels ?? ['stable'];
  let universe = inputs.universe;
  const builds = () =>
    newestFirst(
      resolver,
      universe.core.filter(build => channels.includes(build.channel)).map(({ version }) => version),
    );
  const releaseOf = (key: PackageKey, version: string) =>
    universe.releases.find(release => packageKey(release.package) === key && sameVersion(release.version, version));
  // The same choices are completed again as lists open and close.
  const completions = new Map<string, Promise<Completion>>();

  /**
   * Find a setup, keeping what was loaded.
   * @param requirements - What it must meet
   * @returns The resolution
   */
  async function setupFor(requirements: Requirements) {
    const rounds = await resolveInRounds(universe, requirements, load, { policy });
    // An update never goes back.
    const releases = rounds.universe.releases.filter(release => {
      const from = installed.get(packageKey(release.package));
      return from === undefined || !newer(from, release.version);
    });
    universe = { core: universe.core, releases };
    return rounds.resolution;
  }

  /**
   * The requirements of a recorded world's setup, with some versions pinned.
   * @param uses - What the world uses
   * @param pins - The versions pinned
   * @returns The requirements: the pinned versions, and the installed ones preferred for everything else
   */
  function worldRequirements(uses: WorldUses, pins: ReadonlyMap<PackageKey, string>): Requirements {
    const keys = [{ key: CORE, installed: core }, uses.system, ...uses.modules];
    return {
      require: [uses.system, ...uses.modules].map(({ key }) => ({ package: key })),
      pins: keys.flatMap(({ key }) => {
        const version = pins.get(key);
        return version === undefined ? [] : [{ package: key, version }];
      }),
      prefer: keys
        .filter(({ key }) => !pins.has(key))
        .map(({ key, installed: version }) => ({ package: key, version })),
    };
  }

  /**
   * Complete a set of choices, found afresh, moving Foundry VTT, if the choices need it moved and do not choose it, to
   * the oldest build that works: where the installed one cannot be kept, the resolver takes the newest.
   * @param picks - The versions chosen
   * @returns The completion
   */
  async function completeAfresh(picks: ReadonlyMap<PackageKey, string>): Promise<Completion> {
    const completion = await completeAt(picks);
    const moved = completion.ok ? completion.versions.get(CORE) : undefined;
    if (moved === undefined || picks.has(CORE)) return completion;
    for (const build of [...builds()].reverse()) {
      if (!newer(build, core) || !newer(moved, build)) continue;
      const lower = await completeAt(withChoice(picks, CORE, build));
      if (lower.ok) return lower;
    }
    return completion;
  }

  /**
   * Complete a set of choices, found afresh.
   * @param picks - The versions chosen
   * @returns The completion
   */
  async function completeAt(picks: ReadonlyMap<PackageKey, string>): Promise<Completion> {
    const pins = new Map(picks);
    for (const world of unrecorded) {
      const chosen = pins.get(world.system);
      if (chosen !== undefined && !sameVersion(chosen, world.version)) {
        return { ok: false, hold: { reason: 'unrecorded', world: { id: world.id, title: world.title } } };
      }
    }
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const found = new Map<PackageKey, Set<string>>();
      const note = (key: PackageKey, version: string): void => {
        found.set(key, (found.get(key) ?? new Set()).add(version));
      };
      for (const world of recorded) {
        const resolution = await setupFor(worldRequirements(world.uses, pins));
        const hold: UpdateHold = { reason: 'inconsistent', world: { id: world.id, title: world.title } };
        if (!resolution.ok) return { ok: false, hold };
        note(CORE, resolution.setup.core);
        for (const release of [resolution.setup.system, ...resolution.setup.modules]) {
          note(packageKey(release.package), release.version);
        }
      }
      for (const world of unrecorded) {
        const pinned = pins.get(CORE);
        const resolution = await setupFor({
          require: [{ package: world.system }],
          pins: [
            { package: world.system, version: world.version },
            ...(pinned === undefined ? [] : [{ package: CORE, version: pinned }]),
          ],
          prefer: pinned === undefined ? [{ package: CORE, version: core }] : [],
        });
        const hold: UpdateHold = { reason: 'unrecorded', world: { id: world.id, title: world.title } };
        if (!resolution.ok) return { ok: false, hold };
        note(CORE, resolution.setup.core);
      }

      // Where the worlds disagree, some world needs the newest.
      let settled = true;
      for (const [key, seen] of found) {
        const [newest] = newestFirst(resolver, [...seen]);
        if (seen.size > 1 && newest !== undefined) {
          pins.set(key, newest);
          settled = false;
        }
      }
      if (!settled) continue;

      const build = [...(found.get(CORE) ?? [])][0] ?? pins.get(CORE) ?? core;
      // A version chosen of a package no recorded world uses must run on the build.
      for (const [key, version] of picks) {
        if (key === CORE || found.has(key)) continue;
        const release = releaseOf(key, version);
        if (release === undefined) return { ok: false };
        if (runsOn(resolver, release, build, universe)) continue;
        const needed = [...builds()].reverse().find(candidate => runsOn(resolver, release, candidate, universe));
        if (needed === undefined || pins.has(CORE)) return { ok: false };
        pins.set(CORE, needed);
        settled = false;
      }
      if (!settled) continue;

      const versions = new Map<PackageKey, string>();
      const change = (key: PackageKey, version: string): void => {
        const from = installed.get(key);
        if (from === undefined || !sameVersion(from, version)) versions.set(key, version);
      };
      for (const [key, set] of found) {
        const [version] = [...set];
        if (version !== undefined) change(key, version);
      }
      for (const [key, version] of picks) if (!found.has(key)) change(key, version);
      if (!found.has(CORE)) change(CORE, build);
      return { ok: true, versions };
    }
    return { ok: false };
  }

  return {
    get universe() {
      return universe;
    },

    complete(picks) {
      const signature = JSON.stringify([...picks].sort(([a], [b]) => a.localeCompare(b)));
      const known = completions.get(signature);
      if (known !== undefined) return known;
      const completing = completeAfresh(picks);
      completions.set(signature, completing);
      return completing;
    },

    async plan(picks) {
      const order = [...picks];
      const by = new Map<PackageKey, PackageVersion>();
      let versions: ReadonlyMap<PackageKey, string> = new Map();
      for (const [index, [key, version]] of order.entries()) {
        const completion = await this.complete(new Map(order.slice(0, index + 1)));
        if (!completion.ok) return undefined;
        // A change the choices so far did not make, or made otherwise, is this choice's.
        for (const [changed, to] of completion.versions) {
          if (!picks.has(changed) && versions.get(changed) !== to) by.set(changed, { package: key, version });
        }
        versions = completion.versions;
      }
      const entry = (key: PackageKey, version: string): PlanEntry => {
        const needer = picks.has(key) ? undefined : by.get(key);
        return { key, installed: installed.get(key) ?? version, version, ...(needer !== undefined && { by: needer }) };
      };
      return [
        ...order.filter(([key]) => versions.has(key)).map(([key, version]) => entry(key, version)),
        ...[...versions].filter(([key]) => !picks.has(key)).map(([key, version]) => entry(key, version)),
      ];
    },

    candidates(key) {
      const from = installed.get(key);
      if (from === undefined) return [];
      if (key === CORE) return builds().filter(build => newer(build, from));
      const runnable = builds();
      return newestFirst(
        resolver,
        universe.releases
          .filter(release => packageKey(release.package) === key && newer(release.version, from))
          .filter(release => runnable.some(build => runsOn(resolver, release, build, universe)))
          .map(({ version }) => version),
      );
    },

    titleOf(key) {
      return titles.get(key) ?? key;
    },
  };
}
