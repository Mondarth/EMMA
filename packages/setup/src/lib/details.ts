/**
 * What the panel beside the installation tree shows for a game system, a module, or a group of either. Pure: it works
 * on the overview only.
 */
import type { InstalledModule, InstalledPackage } from '../foundry/setup-game';
import { format, localize } from './i18n';
import type { ModuleStatus, Overview, WorldModule, WorldOverview } from './overview';
import { byTitle } from './overview';
import type { TreeSelection } from './tree';

/** A package another names, and whether it is installed. */
export interface RelatedPackage {
  readonly id: string;
  /** Its title if it is installed, or else its ID. */
  readonly title: string;
  readonly installed: boolean;
}

/** A world that uses a game system. */
export interface SystemWorld {
  readonly title: string;
  /** The system as the world's record says it last ran with it, if it has a record. */
  readonly ran?: WorldModule;
}

/** A game system, wherever the tree shows it, with the worlds that use it and the modules for it. */
export interface SystemDetail {
  readonly id: string;
  readonly title: string;
  /** The system, if it is installed. */
  readonly installed?: InstalledPackage;
  /** The world it shows under, if it shows under one. */
  readonly world?: WorldOverview;
  /** The system as that world's record gives it. */
  readonly ran?: WorldModule;
  /** How it compares with what the world last ran with, or with what is installed. */
  readonly status: ModuleStatus;
  /** The worlds that use it. */
  readonly worlds: readonly SystemWorld[];
  /** How many installed modules are for it. */
  readonly modules: number;
}

/** A world that runs a module, or will when next run. */
export interface RunBy {
  readonly title: string;
  /**
   * If the world's record does not say it runs the module, but it will need it when next run: the titles of the modules
   * it runs that now require it.
   */
  readonly needed?: readonly string[];
}

/** A module, wherever the tree shows it. */
export interface ModuleDetail {
  readonly id: string;
  readonly title: string;
  /** The module, if it is installed. */
  readonly installed?: InstalledModule;
  /** The world it shows under, if it shows under one. */
  readonly world?: WorldOverview;
  /** The module as the world's record gives it, if the world runs it. */
  readonly run?: WorldModule;
  /** How it compares with what the world last ran with, or with what is installed. */
  readonly status: ModuleStatus;
  /** The game systems it is for; none if it is for any. */
  readonly systems: readonly RelatedPackage[];
  /** The modules it requires. */
  readonly requires: readonly RelatedPackage[];
  /** The titles of the installed modules that require it. */
  readonly requiredBy: readonly string[];
  /** The worlds whose records say they run it, or that will need it when next run. */
  readonly runBy: readonly RunBy[];
}

/**
 * A game system's detail.
 * @param overview - The installation
 * @param id - The system's ID
 * @param worldId - The world it shows under, if any
 * @returns The detail
 */
export function systemDetail(overview: Overview, id: string, worldId?: string): SystemDetail {
  const installed = overview.systems.find(system => system.id === id);
  const world = overview.worlds.find(({ world: { id: candidate } }) => candidate === worldId);
  const ran = world?.ranSystem?.id === id ? world.ranSystem : undefined;
  return {
    id,
    title: installed?.title ?? ran?.title ?? id,
    ...(installed !== undefined && { installed }),
    ...(world !== undefined && { world }),
    ...(ran !== undefined && { ran }),
    status: ran?.status ?? (installed === undefined ? 'missing' : 'same'),
    worlds: overview.worlds
      .filter(({ world: { system } }) => system === id)
      .map(({ world: { title }, ranSystem }) => ({ title, ...(ranSystem?.id === id && { ran: ranSystem }) })),
    modules: overview.modules.filter(({ module: pkg }) => pkg.systems.includes(id)).length,
  };
}

/**
 * A module's detail.
 * @param overview - The installation
 * @param id - The module's ID
 * @param worldId - The world it shows under, if any
 * @returns The detail
 */
export function moduleDetail(overview: Overview, id: string, worldId?: string): ModuleDetail {
  const installed = overview.modules.find(({ module: pkg }) => pkg.id === id)?.module;
  const world = overview.worlds.find(({ world: { id: candidate } }) => candidate === worldId);
  const run = world?.modules.find(entry => entry.id === id);
  const systems = new Map(overview.systems.map(system => [system.id, system]));
  const modules = new Map(overview.modules.map(({ module: pkg }) => [pkg.id, pkg]));
  const related = (ids: readonly string[], known: ReadonlyMap<string, { title: string }>): RelatedPackage[] =>
    ids
      .map(other => {
        const found = known.get(other);
        return { id: other, title: found?.title ?? other, installed: found !== undefined };
      })
      .sort(byTitle);
  return {
    id,
    title: installed?.title ?? run?.title ?? id,
    ...(installed !== undefined && { installed }),
    ...(world !== undefined && { world }),
    ...(run !== undefined && { run }),
    status: run?.status ?? (installed === undefined ? 'missing' : 'same'),
    systems: related(installed?.systems ?? [], systems),
    requires: related(installed?.requires ?? [], modules),
    requiredBy: overview.modules
      .filter(({ module: pkg }) => pkg.requires.includes(id))
      .map(({ module: pkg }) => pkg.title),
    runBy: overview.worlds.flatMap(({ world: { title }, modules: running, needs }): RunBy[] => {
      if (running.some(entry => entry.id === id)) return [{ title }];
      const need = needs.find(candidate => candidate.id === id);
      return need === undefined ? [] : [{ title, needed: need.by }];
    }),
  };
}

/** A row that only groups others: what it holds. */
export interface GroupDetail {
  readonly title: string;
  /** Said of the group as a whole, if anything. */
  readonly note?: string;
  /** What it holds, each with a detail beside it if it has one. */
  readonly items: readonly { readonly title: string; readonly detail?: string }[];
}

/** The rows that only group others. */
export type GroupSelection = Extract<TreeSelection, { kind: 'systems' | 'modules' | 'group' }>;

/**
 * What a grouping row holds, as the tree shows it.
 * @param overview - The installation
 * @param selection - The row
 * @returns The detail
 */
export function groupDetail(overview: Overview, selection: GroupSelection): GroupDetail {
  switch (selection.kind) {
    case 'systems': {
      const installed = new Set(overview.systems.map(({ id }) => id));
      const ids = [
        ...overview.systems.map(({ id }) => id),
        ...[...new Set(overview.worlds.map(({ world }) => world.system))].filter(id => !installed.has(id)).sort(),
      ];
      return {
        title: localize('Tree.Systems'),
        items: ids.map(id => {
          const system = systemDetail(overview, id);
          return {
            title: system.title,
            detail: format('Group.WorldCount', { count: system.worlds.length }),
          };
        }),
      };
    }
    case 'modules': {
      const titles = new Map(overview.systems.map(({ id, title }) => [id, title]));
      const universal = overview.modules.filter(({ module: pkg }) => pkg.systems.length === 0).length;
      const systems = [...new Set(overview.modules.flatMap(({ module: pkg }) => pkg.systems))]
        .map(id => ({ id, title: titles.get(id) ?? id }))
        .sort(byTitle);
      return {
        title: localize('Tree.Modules'),
        note: format('Group.ModulesNote', { count: overview.modules.length }),
        items: [
          ...(universal === 0 ? [] : [{ title: localize('Tree.Universal'), count: universal }]),
          ...systems.map(({ id, title }) => ({ title, count: systemDetail(overview, id).modules })),
        ].map(({ title, count }) => ({ title, detail: format('Group.ModuleCount', { count }) })),
      };
    }
    case 'group': {
      const { system } = selection;
      const modules = overview.modules
        .map(({ module: pkg }) => pkg)
        .filter(pkg => (system === undefined ? pkg.systems.length === 0 : pkg.systems.includes(system)));
      const installed = overview.systems.find(({ id }) => id === system);
      return {
        title: system === undefined ? localize('Tree.Universal') : (installed?.title ?? system),
        note:
          system === undefined
            ? localize('Group.UniversalNote')
            : format(installed === undefined ? 'Group.SystemMissingNote' : 'Group.SystemNote', {
                title: installed?.title ?? system,
              }),
        items: modules.map(({ title, version }) => ({ title, detail: version })),
      };
    }
  }
}
