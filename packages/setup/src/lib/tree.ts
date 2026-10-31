/**
 * The installation tree, as the EMMA extension's standard mode shows it:
 *
 * - the root, Foundry VTT itself;
 *   - the game systems, each with the worlds that use it, and under each world the system and the modules its record
 *     says it last ran with;
 *   - the modules, grouped by the game systems they are for: first those for any system, then those for each system.
 *
 * A module that requires others has them under it, wherever it shows, so a module may show many times. Every row with
 * rows under it can be expanded and collapsed. Pure: which rows are showing, and where the keyboard moves between them.
 */
import { format, localize } from './i18n';
import type { ModuleStatus, ModuleUse, Overview, WorldModule, WorldOverview, WorldStatus } from './overview';
import { byTitle } from './overview';

/** What is selected in the tree, and so shown in the panel beside it. */
export type TreeSelection =
  | { readonly kind: 'root' }
  /** The game systems, and the worlds under them. */
  | { readonly kind: 'systems' }
  /** A game system, shown under a world if `world` is given. */
  | { readonly kind: 'system'; readonly system: string; readonly world?: string }
  | { readonly kind: 'world'; readonly world: string }
  /** The modules, grouped by game system. */
  | { readonly kind: 'modules' }
  /** The modules for one game system, or for any system if `system` is not given. */
  | { readonly kind: 'group'; readonly system?: string }
  /** A module, shown under a world if `world` is given. */
  | { readonly kind: 'module'; readonly module: string; readonly world?: string };

/** The status shown beside a row: a world's, or a package's. */
export type RowStatus =
  { readonly kind: 'world'; readonly value: WorldStatus } | { readonly kind: 'package'; readonly value: ModuleStatus };

/** A row of the tree. */
export interface TreeRow {
  /** The path to the row, from the root: unique within the tree, and the key of a row that can be expanded. */
  readonly key: string;
  /** 1 for the root, and one more for each row it is under. */
  readonly level: number;
  readonly selection: TreeSelection;
  readonly title: string;
  /** The version shown beside the title, if any. */
  readonly version?: string;
  /** Whether that version is the one installed, rather than the one a world last ran with. */
  readonly installed?: true;
  readonly status?: RowStatus;
  /** Whether the row has rows under it. */
  readonly expandable: boolean;
  /** The key of the row it is under, if any. */
  readonly parent?: string;
}

/** The root row's key. */
export const ROOT = 'root';
/** The game systems' row's key. */
export const SYSTEMS = `${ROOT}/systems`;
/** The modules' row's key. */
export const MODULES = `${ROOT}/modules`;

/** The rows expanded when the tree first shows: the root, and the game systems and the modules under it. */
export const INITIALLY_EXPANDED: readonly string[] = [ROOT, SYSTEMS, MODULES];

/** A row, and how to find the rows under it, which are only worked out while it shows. */
interface TreeNode {
  /** The row's part of its key. */
  readonly segment: string;
  readonly selection: TreeSelection;
  readonly title: string;
  readonly version?: string;
  /** Whether the version is the one installed. */
  readonly installed?: true;
  readonly status?: RowStatus;
  readonly children: () => readonly TreeNode[];
}

/**
 * The rows showing, from the top: those under a row show only while it is expanded.
 * @param overview - The installation
 * @param expanded - The keys of the rows expanded
 * @returns The rows, in order
 */
export function visibleRows(overview: Overview, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (node: TreeNode, level: number, parent?: string): void => {
    const key = parent === undefined ? node.segment : `${parent}/${node.segment}`;
    const children = node.children();
    rows.push({
      key,
      level,
      selection: node.selection,
      title: node.title,
      ...(node.version !== undefined && { version: node.version }),
      ...(node.installed && { installed: true }),
      ...(node.status !== undefined && { status: node.status }),
      expandable: children.length > 0,
      ...(parent !== undefined && { parent }),
    });
    if (!expanded.has(key)) return;
    for (const child of children) visit(child, level + 1, key);
  };
  visit(rootNode(overview), 1);
  return rows;
}

/**
 * The root: Foundry VTT, with the game systems and the modules under it.
 * @param overview - The installation
 * @returns The root's node
 */
function rootNode(overview: Overview): TreeNode {
  const modules = new Map(overview.modules.map(use => [use.module.id, use]));
  const systems: TreeNode = {
    segment: 'systems',
    selection: { kind: 'systems' },
    title: localize('Tree.Systems'),
    children: () => systemNodes(overview, modules),
  };
  const grouped: TreeNode = {
    segment: 'modules',
    selection: { kind: 'modules' },
    title: localize('Tree.Modules'),
    children: () => groupNodes(overview, modules),
  };
  return {
    segment: ROOT,
    selection: { kind: 'root' },
    title: format('Tree.Root', { version: overview.core }),
    children: () => [systems, grouped],
  };
}

/** The status of a package that is installed. */
const INSTALLED: RowStatus = { kind: 'package', value: 'same' };
/** The status of a package that is not installed. */
const MISSING: RowStatus = { kind: 'package', value: 'missing' };

/**
 * The game systems: those installed, then any that a world uses but is not installed.
 * @param overview - The installation
 * @param modules - The installed modules, by ID
 * @returns Their nodes
 */
function systemNodes(overview: Overview, modules: ReadonlyMap<string, ModuleUse>): TreeNode[] {
  const installed = new Set(overview.systems.map(({ id }) => id));
  const missing = [...new Set(overview.worlds.map(({ world }) => world.system))]
    .filter(id => !installed.has(id))
    .map(id => ({ id, title: id }))
    .sort(byTitle);
  const node = (
    id: string,
    title: string,
    shown: { version?: string; installed?: true; status: RowStatus },
  ): TreeNode => ({
    segment: `system:${id}`,
    selection: { kind: 'system', system: id },
    title,
    ...shown,
    children: () => overview.worlds.filter(({ world }) => world.system === id).map(world => worldNode(world, modules)),
  });
  return [
    ...overview.systems.map(({ id, title, version }) =>
      node(id, title, { version, installed: true, status: INSTALLED }),
    ),
    ...missing.map(({ id }) => node(id, id, { status: MISSING })),
  ];
}

/**
 * A world, with the game system and the modules its record says it last ran with.
 * @param overview - The world
 * @param modules - The installed modules, by ID
 * @returns Its node
 */
function worldNode(overview: WorldOverview, modules: ReadonlyMap<string, ModuleUse>): TreeNode {
  const { world, status, ranSystem } = overview;
  return {
    segment: `world:${world.id}`,
    selection: { kind: 'world', world: world.id },
    title: world.title,
    status: { kind: 'world', value: status },
    children: () => [
      ...(ranSystem === undefined ? [] : [ranSystemNode(ranSystem, world.id)]),
      ...overview.modules.map(entry => runNode(entry, world.id, modules)),
    ],
  };
}

/**
 * The game system a world last ran with, at the version its record gives.
 * @param entry - The system, as the world's record gives it
 * @param world - The world's ID
 * @returns Its node
 */
function ranSystemNode(entry: WorldModule, world: string): TreeNode {
  return {
    segment: `system:${entry.id}`,
    selection: { kind: 'system', system: entry.id, world },
    title: entry.title,
    version: entry.recorded,
    status: { kind: 'package', value: entry.status },
    children: () => [],
  };
}

/**
 * A module a world runs, at the version its record gives, with the modules it requires.
 * @param entry - The module, as the world's record gives it
 * @param world - The world's ID
 * @param modules - The installed modules, by ID
 * @returns Its node
 */
function runNode(entry: WorldModule, world: string, modules: ReadonlyMap<string, ModuleUse>): TreeNode {
  return {
    segment: `module:${entry.id}`,
    selection: { kind: 'module', module: entry.id, world },
    title: entry.title,
    version: entry.recorded,
    status: { kind: 'package', value: entry.status },
    children: () => requirementNodes([entry.id], world, modules),
  };
}

/**
 * An installed module, as the modules' groups show it, with the modules it requires.
 * @param use - The module, with the worlds it is active in
 * @param modules - The installed modules, by ID
 * @returns Its node
 */
function installedNode(use: ModuleUse, modules: ReadonlyMap<string, ModuleUse>): TreeNode {
  const { id, title, version } = use.module;
  return {
    segment: `module:${id}`,
    selection: { kind: 'module', module: id },
    title,
    version,
    installed: true,
    children: () => requirementNodes([id], undefined, modules),
  };
}

/**
 * The modules a module requires, by title, each as installed, with the modules it requires in turn.
 * @param path - The IDs of the module, first, and of the modules it is under, none of which shows again under it
 * @param world - The world it is under, if any
 * @param modules - The installed modules, by ID
 * @returns Their nodes; none if the module is not installed, as only its manifest says what it requires
 */
function requirementNodes(
  path: readonly [string, ...string[]],
  world: string | undefined,
  modules: ReadonlyMap<string, ModuleUse>,
): TreeNode[] {
  const requires = modules.get(path[0])?.module.requires ?? [];
  return requires
    .filter(required => !path.includes(required))
    .map(required => ({ id: required, title: modules.get(required)?.module.title ?? required }))
    .sort(byTitle)
    .map(({ id, title }): TreeNode => {
      const installed = modules.get(id)?.module;
      return {
        segment: `module:${id}`,
        selection: { kind: 'module', module: id, ...(world !== undefined && { world }) },
        title,
        ...(installed === undefined ? { status: MISSING } : { version: installed.version, installed: true }),
        children: () => requirementNodes([id, ...path], world, modules),
      };
    });
}

/**
 * The modules, grouped: those for any game system, then those for each system, by the system's title.
 * @param overview - The installation
 * @param modules - The installed modules, by ID
 * @returns The groups' nodes, leaving out any without modules
 */
function groupNodes(overview: Overview, modules: ReadonlyMap<string, ModuleUse>): TreeNode[] {
  const titles = new Map(overview.systems.map(({ id, title }) => [id, title]));
  const universal = overview.modules.filter(({ module: pkg }) => pkg.systems.length === 0);
  const systems = [...new Set(overview.modules.flatMap(({ module: pkg }) => pkg.systems))]
    .map(id => ({ id, title: titles.get(id) ?? id }))
    .sort(byTitle);
  const groups: TreeNode[] = systems.map(({ id, title }) => ({
    segment: `system:${id}`,
    selection: { kind: 'group', system: id },
    title,
    ...(!titles.has(id) && { status: MISSING }),
    children: () =>
      overview.modules.filter(({ module: pkg }) => pkg.systems.includes(id)).map(use => installedNode(use, modules)),
  }));
  if (universal.length === 0) return groups;
  return [
    {
      segment: 'universal',
      selection: { kind: 'group' },
      title: localize('Tree.Universal'),
      children: () => universal.map(use => installedNode(use, modules)),
    },
    ...groups,
  ];
}

/**
 * The package a row shows, as the resolver names it.
 * @param selection - The row's selection
 * @returns `system:<id>` or `module:<id>`, or `undefined` for a row that shows no package
 */
export function packageOf(selection: TreeSelection): string | undefined {
  if (selection.kind === 'system') return `system:${selection.system}`;
  if (selection.kind === 'module') return `module:${selection.module}`;
  return undefined;
}

/** Where a key moves the keyboard's row, or how it changes what is expanded. */
export type TreeMove =
  | { readonly kind: 'focus'; readonly key: string }
  | { readonly kind: 'expand'; readonly key: string }
  | { readonly kind: 'collapse'; readonly key: string };

/**
 * What a key does in the tree, as the ARIA tree pattern has it: the arrows move up and down and in and out, Home and
 * End go to the first and last row showing.
 * @param rows - The rows showing
 * @param current - The key of the keyboard's row
 * @param expanded - The keys of the rows expanded
 * @param key - The key pressed, as `KeyboardEvent.key` gives it
 * @returns What it does, or `undefined` if nothing
 */
export function moveFor(
  rows: readonly TreeRow[],
  current: string,
  expanded: ReadonlySet<string>,
  key: string,
): TreeMove | undefined {
  const index = rows.findIndex(({ key: candidate }) => candidate === current);
  const row = rows[index];
  if (row === undefined) return undefined;
  const toRow = (target: TreeRow | undefined): TreeMove | undefined =>
    target === undefined ? undefined : { kind: 'focus', key: target.key };
  switch (key) {
    case 'ArrowDown':
      return toRow(rows[index + 1]);
    case 'ArrowUp':
      return toRow(rows[index - 1]);
    case 'Home':
      return toRow(rows[0]);
    case 'End':
      return toRow(rows.at(-1));
    case 'ArrowRight':
      if (!row.expandable) return undefined;
      return expanded.has(row.key) ? toRow(rows[index + 1]) : { kind: 'expand', key: row.key };
    case 'ArrowLeft':
      if (row.expandable && expanded.has(row.key)) return { kind: 'collapse', key: row.key };
      return row.parent === undefined ? undefined : { kind: 'focus', key: row.parent };
    default:
      return undefined;
  }
}
