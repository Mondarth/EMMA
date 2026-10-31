/**
 * What EMMA shows on the setup screen: each world with the modules its record says it runs, compared with what is
 * installed now, and a summary of the whole installation. Pure: it works on plain values only.
 */
import type { WorldRecord } from '@mondarth/emma-core/world-record';

import type { RecordState } from '../foundry/records';
import type { InstalledModule, InstalledPackage, InstalledWorld, Installation } from '../foundry/setup-game';

/**
 * How a world's record compares with what is installed now:
 * - `matches`: Foundry, the system and every module are installed at the versions the world last ran with;
 * - `differs`: something has changed since, or is no longer installed;
 * - `unrecorded`: the world has no record, as it has not been opened with EMMA 0.9 or later active;
 * - `unreadable`: its record cannot be read.
 */
export type WorldStatus = 'matches' | 'differs' | 'unrecorded' | 'unreadable';

/**
 * How a module a world runs compares with what is installed: at the version the world last ran with, at another
 * version, or not installed at all.
 */
export type ModuleStatus = 'same' | 'other' | 'missing';

/** A package a world's record says it runs: a module, or the game system. */
export interface WorldModule {
  readonly id: string;
  readonly title: string;
  /** The version the world last ran with. */
  readonly recorded: string;
  /** The version installed now, if it is installed. */
  readonly installed?: string;
  readonly status: ModuleStatus;
}

/**
 * A module a world's record does not say it runs, but that the world will need when next run, as modules it runs require
 * it as they are installed now: typically because one was updated since and the new version requires more.
 */
export interface WorldNeed {
  readonly id: string;
  /** Its title if it is installed, or else its ID. */
  readonly title: string;
  readonly installed: boolean;
  /** The titles of the modules the world runs that now require it, directly or through others it does not run yet. */
  readonly by: readonly string[];
}

/** Something installed that is not as the world last ran with it. */
export type Difference =
  | { readonly kind: 'core'; readonly recorded: string; readonly installed: string }
  | { readonly kind: 'system'; readonly title: string; readonly recorded: string; readonly installed?: string }
  | { readonly kind: 'module'; readonly title: string; readonly recorded: string; readonly installed?: string };

/** A world, as EMMA shows it. */
export interface WorldOverview {
  readonly world: InstalledWorld;
  /** The installed game system the world uses, if it is installed. */
  readonly system?: InstalledPackage;
  readonly status: WorldStatus;
  /** The world's record, if it has one EMMA can read. */
  readonly record?: WorldRecord;
  /** The game system the record says the world last ran with, compared with what is installed, if it has a record. */
  readonly ranSystem?: WorldModule;
  /** The modules the record says the world runs, sorted by title. Empty without a record. */
  readonly modules: readonly WorldModule[];
  /** The modules the world will need when next run that its record does not say it runs. Empty without a record. */
  readonly needs: readonly WorldNeed[];
  /** What is not installed as the world last ran with it. */
  readonly differences: readonly Difference[];
}

/** An installed module, with the worlds whose records say they run it, or that will need it when next run. */
export interface ModuleUse {
  readonly module: InstalledModule;
  /** The IDs of the worlds, in the order of {@link Overview.worlds}. */
  readonly worlds: readonly string[];
  /** The IDs of those of the worlds that only will need it when next run (see {@link WorldNeed}). */
  readonly needed: readonly string[];
}

/** A summary of the installation, for the root of the tree. */
export interface Summary {
  readonly worlds: {
    readonly total: number;
    /** How many worlds use each system, most used first. */
    readonly systems: readonly { readonly id: string; readonly title: string; readonly count: number }[];
    readonly byStatus: Readonly<Record<WorldStatus, number>>;
  };
  readonly modules: {
    readonly total: number;
    /** How many installed modules a recorded world runs, or will need when next run. */
    readonly used: number;
    /** How many of those only will be needed when next run, by every recorded world that uses them. */
    readonly pending: number;
    /** How many installed modules no recorded world runs. Worlds without a record may run them. */
    readonly unused: number;
  };
}

/** Everything EMMA shows on the setup screen. */
export interface Overview {
  readonly core: string;
  /** The installed game systems, sorted by title. */
  readonly systems: readonly InstalledPackage[];
  readonly worlds: readonly WorldOverview[];
  /** The installed modules, sorted by title. */
  readonly modules: readonly ModuleUse[];
  readonly summary: Summary;
}

/**
 * Compare each world's record with what is installed, and summarise the installation.
 * @param installation - What is installed
 * @param records - What each world's folder holds of its record, by world ID
 * @returns The overview
 */
export function buildOverview(installation: Installation, records: ReadonlyMap<string, RecordState>): Overview {
  const modules = new Map(installation.modules.map(pkg => [pkg.id, pkg]));
  const systems = new Map(installation.systems.map(pkg => [pkg.id, pkg]));
  const worlds = installation.worlds.map(world =>
    worldOverview(world, records.get(world.id) ?? { kind: 'none' }, installation.core, modules, systems),
  );
  const uses = installation.modules.map((installed): ModuleUse => {
    const runs = (world: WorldOverview): boolean => world.modules.some(({ id }) => id === installed.id);
    const needs = (world: WorldOverview): boolean => world.needs.some(({ id }) => id === installed.id);
    return {
      module: installed,
      worlds: worlds.filter(world => runs(world) || needs(world)).map(({ world }) => world.id),
      needed: worlds.filter(needs).map(({ world }) => world.id),
    };
  });
  return {
    core: installation.core,
    systems: installation.systems,
    worlds,
    modules: uses,
    summary: summarise(worlds, uses, systems),
  };
}

/**
 * Compare one world's record with what is installed.
 * @param world - The world
 * @param state - What its folder holds of its record
 * @param core - The Foundry version installed
 * @param modules - The installed modules, by ID
 * @param systems - The installed systems, by ID
 * @returns The world's overview
 */
function worldOverview(
  world: InstalledWorld,
  state: RecordState,
  core: string,
  modules: ReadonlyMap<string, InstalledModule>,
  systems: ReadonlyMap<string, InstalledPackage>,
): WorldOverview {
  const installedSystem = systems.get(world.system);
  const base = { world, ...(installedSystem !== undefined && { system: installedSystem }) };
  if (state.kind !== 'recorded') {
    return {
      ...base,
      status: state.kind === 'none' ? 'unrecorded' : 'unreadable',
      modules: [],
      needs: [],
      differences: [],
    };
  }
  const { record } = state;
  const ranSystem = compared(record.system, systems);
  const run = record.modules.map(entry => compared(entry, modules)).sort(byTitle);

  const differences: Difference[] = [];
  if (record.core !== core) differences.push({ kind: 'core', recorded: record.core, installed: core });
  if (ranSystem.status !== 'same') {
    differences.push({
      kind: 'system',
      title: ranSystem.title,
      recorded: ranSystem.recorded,
      ...(ranSystem.installed !== undefined && { installed: ranSystem.installed }),
    });
  }
  for (const entry of run) {
    if (entry.status === 'same') continue;
    differences.push({
      kind: 'module',
      title: entry.title,
      recorded: entry.recorded,
      ...(entry.installed !== undefined && { installed: entry.installed }),
    });
  }

  return {
    ...base,
    status: differences.length === 0 ? 'matches' : 'differs',
    record,
    ranSystem,
    modules: run,
    needs: needsOf(run, modules),
    differences,
  };
}

/**
 * Compare a package as a world's record gives it with what is installed.
 * @param recorded - The package as the record gives it
 * @param recorded.id - Its ID
 * @param recorded.title - Its title
 * @param recorded.version - The version the world last ran with
 * @param installed - The installed packages of its kind, by ID
 * @returns The comparison
 */
function compared(
  { id, title, version }: { id: string; title: string; version: string },
  installed: ReadonlyMap<string, InstalledPackage>,
): WorldModule {
  const now = installed.get(id)?.version;
  const status = now === undefined ? 'missing' : now === version ? 'same' : 'other';
  return { id, title, recorded: version, ...(now !== undefined && { installed: now }), status };
}

/**
 * The modules a world will need when next run that its record does not say it runs: those the modules it runs require
 * as installed now, and those they require in turn.
 * @param run - The modules the world's record says it runs, sorted by title
 * @param modules - The installed modules, by ID
 * @returns The modules it will need, each with the titles of the modules it runs that require it
 */
function needsOf(run: readonly WorldModule[], modules: ReadonlyMap<string, InstalledModule>): WorldNeed[] {
  const recorded = new Set(run.map(({ id }) => id));
  const needs = new Map<string, string[]>();
  for (const entry of run) {
    const seen = new Set([entry.id]);
    const pending = [...(modules.get(entry.id)?.requires ?? [])];
    for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
      // A module the world runs is already accounted for, with what it requires.
      if (seen.has(id) || recorded.has(id)) continue;
      seen.add(id);
      needs.set(id, [...(needs.get(id) ?? []), entry.title]);
      pending.push(...(modules.get(id)?.requires ?? []));
    }
  }
  return [...needs].map(([id, by]) => {
    const installed = modules.get(id);
    return { id, title: installed?.title ?? id, installed: installed !== undefined, by };
  });
}

/**
 * Summarise the installation.
 * @param worlds - The worlds' overviews
 * @param uses - The installed modules, with the worlds that run them
 * @param systems - The installed systems, by ID
 * @returns The summary
 */
function summarise(
  worlds: readonly WorldOverview[],
  uses: readonly ModuleUse[],
  systems: ReadonlyMap<string, InstalledPackage>,
): Summary {
  const bySystem = new Map<string, number>();
  for (const { world } of worlds) bySystem.set(world.system, (bySystem.get(world.system) ?? 0) + 1);
  const byStatus: Record<WorldStatus, number> = { matches: 0, differs: 0, unrecorded: 0, unreadable: 0 };
  for (const { status } of worlds) byStatus[status] += 1;
  const used = uses.filter(({ worlds: running }) => running.length > 0);
  const pending = used.filter(({ worlds: running, needed }) => needed.length === running.length).length;
  return {
    worlds: {
      total: worlds.length,
      systems: [...bySystem]
        .map(([id, count]) => ({ id, title: systems.get(id)?.title ?? id, count }))
        .sort((a, b) => b.count - a.count || byTitle(a, b)),
      byStatus,
    },
    modules: { total: uses.length, used: used.length, pending, unused: uses.length - used.length },
  };
}

/**
 * Order by title in the user's language, then by ID.
 * @param a - One package
 * @param a.id - Its ID
 * @param a.title - Its title
 * @param b - Another
 * @param b.id - Its ID
 * @param b.title - Its title
 * @returns The order
 */
export function byTitle(a: { id: string; title: string }, b: { id: string; title: string }): number {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return collator.compare(a.title, b.title) || collator.compare(a.id, b.id);
}
