/**
 * The installation tree, as the EMMA extension's standard mode shows it:
 *
 * - the root, Foundry VTT itself;
 *   - the game systems, each with the worlds that use it, and under each world the system and the modules its record
 *     says it last ran with;
 *   - the modules, grouped by the game systems they are for: first those for any system, then those for each system.
 *
 * A package the plan installs anew shows as installed ones do, at the version the plan takes, marked as pending: a game
 * system among the game systems, and a module in the groups of the systems it is for.
 *
 * A module that requires others has them under it, wherever it shows, so a module may show many times. Every row with
 * rows under it can be expanded and collapsed, and while it is collapsed says which packages it hides, so that it can
 * show what they have, as updates. Pure: which rows are showing, and where the keyboard moves between them.
 */
import { localize } from './i18n';
import type { ModuleStatus, ModuleUse, Overview, WorldModule, WorldOverview, WorldStatus } from './overview';
import { byTitle, isIgnored } from './overview';

/** What is selected in the tree, and so shown in the panel beside it. */
export type TreeSelection =
  | { readonly kind: 'root' }
  /** The worlds, each with what it last ran with under it. */
  | { readonly kind: 'worlds' }
  /** The game systems. */
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

/** A package the plan installs anew, not installed yet. */
export interface PendingPackage {
  /** `system:<id>` or `module:<id>`. */
  readonly key: string;
  readonly title: string;
  /** The version the plan takes. */
  readonly version: string;
  /** For a module, the IDs of the game systems it is for; empty if it is for any. */
  readonly systems: readonly string[];
}

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
  /** Whether the row is of a package the plan installs anew, or of the group of modules for such a game system. */
  readonly pending?: true;
  /** Whether the row shows a package installed and locked in Foundry, which is kept as it is. */
  readonly locked?: true;
  /** For a module another recommends, as a row under it: that module's key, `module:<id>`. */
  readonly recommendedBy?: string;
  readonly status?: RowStatus;
  /** Whether EMMA ignores the world, game system or module the row shows. */
  readonly ignored?: true;
  /** Whether the row has rows under it. */
  readonly expandable: boolean;
  /** While it is collapsed, the packages in the rows under it, at any depth, as {@link packageOf} names them. */
  readonly hides?: ReadonlySet<string>;
  /** The key of the row it is under, if any. */
  readonly parent?: string;
}

/** The root row's key. */
export const ROOT = 'root';
/** The worlds' row's key. */
export const WORLDS = `${ROOT}/worlds`;
/** The game systems' row's key. */
export const SYSTEMS = `${ROOT}/systems`;
/** The modules' row's key. */
export const MODULES = `${ROOT}/modules`;

/** The rows expanded when the tree first shows: the root, and the worlds, the game systems and the modules under it. */
export const INITIALLY_EXPANDED: readonly string[] = [ROOT, WORLDS, SYSTEMS, MODULES];

/** A row, and how to find the rows under it, which are only worked out while it shows. */
interface TreeNode {
  /** The row's part of its key. */
  readonly segment: string;
  readonly selection: TreeSelection;
  readonly title: string;
  readonly version?: string;
  /** Whether the version is the one installed. */
  readonly installed?: true;
  readonly pending?: true;
  readonly locked?: true;
  readonly recommendedBy?: string;
  readonly status?: RowStatus;
  readonly children: () => readonly TreeNode[];
}

/** The packages the plan installs anew, by key. */
type Pending = ReadonlyMap<string, PendingPackage>;

/**
 * The rows showing, from the top: those under a row show only while it is expanded.
 * @param overview - The installation
 * @param expanded - The keys of the rows expanded
 * @param pending - The packages the plan installs anew
 * @returns The rows, in order
 */
export function visibleRows(
  overview: Overview,
  expanded: ReadonlySet<string>,
  pending: readonly PendingPackage[] = [],
): TreeRow[] {
  return rowsOf(overview, key => expanded.has(key), pending);
}

/**
 * Every row of the tree, from the top, as if each were expanded, as the finder and the panels' links look in.
 * @param overview - The installation
 * @param pending - The packages the plan installs anew
 * @returns The rows, in order
 */
export function allRows(overview: Overview, pending: readonly PendingPackage[] = []): TreeRow[] {
  return rowsOf(overview, () => true, pending);
}

/**
 * The rows of the tree that show, from the top.
 * @param overview - The installation
 * @param isExpanded - Whether a row, by its key, is expanded
 * @param pending - The packages the plan installs anew
 * @returns The rows, in order
 */
function rowsOf(
  overview: Overview,
  isExpanded: (key: string) => boolean,
  pending: readonly PendingPackage[],
): TreeRow[] {
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
      ...(node.pending && { pending: true }),
      ...(node.locked && { locked: true }),
      ...(node.recommendedBy !== undefined && { recommendedBy: node.recommendedBy }),
      ...(isIgnored(overview, ignoreKeyOf(node.selection) ?? '') && { ignored: true }),
      ...(node.status !== undefined && { status: node.status }),
      expandable: children.length > 0,
      ...(children.length > 0 && !isExpanded(key) && { hides: packagesUnder(children) }),
      ...(parent !== undefined && { parent }),
    });
    if (!isExpanded(key)) return;
    for (const child of children) visit(child, level + 1, key);
  };
  visit(rootNode(overview, new Map(pending.map(entry => [entry.key, entry]))), 1);
  return rows;
}

/**
 * The packages in rows, and in the rows under them, at any depth.
 * @param nodes - The rows
 * @returns The packages, as {@link packageOf} names them
 */
function packagesUnder(nodes: readonly TreeNode[]): Set<string> {
  const found = new Set<string>();
  const visit = (node: TreeNode): void => {
    const key = packageOf(node.selection);
    // A module has the modules it requires under it wherever it shows, but for those it is already under, which are
    // found already: what is under it the first time it is found is enough. Requirements that loop end this way too.
    if (key !== undefined && node.selection.kind === 'module' && found.has(key)) return;
    if (key !== undefined) found.add(key);
    for (const child of node.children()) visit(child);
  };
  for (const node of nodes) visit(node);
  return found;
}

/**
 * The root: Foundry VTT, with the worlds, the game systems and the modules under it, in the order Foundry's Setup screen
 * gives them.
 * @param overview - The installation
 * @param pending - The packages the plan installs anew
 * @returns The root's node
 */
function rootNode(overview: Overview, pending: Pending): TreeNode {
  const modules = new Map(overview.modules.map(use => [use.module.id, use]));
  const worlds: TreeNode = {
    segment: 'worlds',
    selection: { kind: 'worlds' },
    title: localize('Tree.Worlds'),
    children: () => overview.worlds.map(world => worldNode(world, modules, pending)),
  };
  const systems: TreeNode = {
    segment: 'systems',
    selection: { kind: 'systems' },
    title: localize('Tree.Systems'),
    children: () => systemNodes(overview, pending),
  };
  const grouped: TreeNode = {
    segment: 'modules',
    selection: { kind: 'modules' },
    title: localize('Tree.Modules'),
    children: () => groupNodes(overview, modules, pending),
  };
  return {
    segment: ROOT,
    selection: { kind: 'root' },
    title: localize('Tree.Root'),
    version: overview.core,
    installed: true,
    ...(overview.coreLocked && { locked: true }),
    children: () => [worlds, systems, grouped],
  };
}

/** The status of a package that is installed at the version in use: a world's, or one a world uses. */
const IN_USE: RowStatus = { kind: 'package', value: 'same' };
/** The status of a package that is not installed. */
const MISSING: RowStatus = { kind: 'package', value: 'missing' };

/**
 * The packages of a type the plan installs anew, by title.
 * @param pending - The packages the plan installs anew
 * @param type - Which type
 * @returns Them, with their IDs
 */
function pendingOf(pending: Pending, type: 'system' | 'module'): (PendingPackage & { id: string })[] {
  return [...pending.values()]
    .filter(({ key }) => key.startsWith(`${type}:`))
    .map(entry => ({ ...entry, id: entry.key.slice(type.length + 1) }))
    .sort(byTitle);
}

/**
 * The game systems: those installed, then those the plan installs anew, then any that a world uses but is not
 * installed.
 * @param overview - The installation
 * @param pending - The packages the plan installs anew
 * @returns Their nodes
 */
function systemNodes(overview: Overview, pending: Pending): TreeNode[] {
  const installed = new Set(overview.systems.map(({ id }) => id));
  const planned = pendingOf(pending, 'system').filter(({ id }) => !installed.has(id));
  const missing = [...new Set(overview.worlds.map(({ world }) => world.system))]
    .filter(id => !installed.has(id) && !pending.has(`system:${id}`))
    .map(id => ({ id, title: id }))
    .sort(byTitle);
  const node = (
    id: string,
    title: string,
    shown: { version?: string; installed?: true; pending?: true; locked?: true; status?: RowStatus },
  ): TreeNode => ({
    segment: `system:${id}`,
    selection: { kind: 'system', system: id },
    title,
    ...shown,
    // The worlds that use it are under the worlds' row; its panel names them.
    children: () => [],
  });
  return [
    ...overview.systems.map(({ id, title, version, locked }) =>
      node(id, title, {
        version,
        installed: true,
        ...(locked && { locked }),
        // That it is installed, its version says; that a world uses it, its status.
        ...(overview.worlds.some(({ world }) => world.system === id) && { status: IN_USE }),
      }),
    ),
    ...planned.map(({ id, title, version }) => node(id, title, { version, pending: true })),
    ...missing.map(({ id }) => node(id, id, { status: MISSING })),
  ];
}

/**
 * A world, with the game system and the modules its record says it last ran with.
 * @param overview - The world
 * @param modules - The installed modules, by ID
 * @param pending - The packages the plan installs anew
 * @returns Its node
 */
function worldNode(overview: WorldOverview, modules: ReadonlyMap<string, ModuleUse>, pending: Pending): TreeNode {
  const { world, status, ranSystem } = overview;
  return {
    segment: `world:${world.id}`,
    selection: { kind: 'world', world: world.id },
    title: world.title,
    status: { kind: 'world', value: status },
    children: () => [
      ...(ranSystem === undefined ? [] : [ranSystemNode(ranSystem, world.id)]),
      ...overview.modules.map(entry => runNode(entry, world.id, modules, pending)),
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
 * @param pending - The packages the plan installs anew
 * @returns Its node
 */
function runNode(
  entry: WorldModule,
  world: string,
  modules: ReadonlyMap<string, ModuleUse>,
  pending: Pending,
): TreeNode {
  return {
    segment: `module:${entry.id}`,
    selection: { kind: 'module', module: entry.id, world },
    title: entry.title,
    version: entry.recorded,
    status: { kind: 'package', value: entry.status },
    children: () => requirementNodes([entry.id], world, modules, pending),
  };
}

/**
 * An installed module, as the modules' groups show it, with the modules it requires.
 * @param use - The module, with the worlds it is active in
 * @param modules - The installed modules, by ID
 * @param pending - The packages the plan installs anew
 * @returns Its node
 */
function installedNode(use: ModuleUse, modules: ReadonlyMap<string, ModuleUse>, pending: Pending): TreeNode {
  const { id, title, version, locked } = use.module;
  return {
    segment: `module:${id}`,
    selection: { kind: 'module', module: id },
    title,
    version,
    installed: true,
    ...(locked && { locked }),
    // That it is installed, its version says; that a world uses it, its status.
    ...(use.worlds.length > 0 && { status: IN_USE }),
    children: () => [
      ...requirementNodes([id], undefined, modules, pending),
      ...recommendationNodes(use, modules, pending),
    ],
  };
}

/**
 * The modules a module recommends, by title, after what it requires, each with a checkbox to want it with the module:
 * as installed, as the plan installs it, or not installed. What it requires as well is not shown again.
 * @param use - The module
 * @param modules - The installed modules, by ID
 * @param pending - The packages the plan installs anew
 * @returns Their nodes, with nothing under them
 */
function recommendationNodes(use: ModuleUse, modules: ReadonlyMap<string, ModuleUse>, pending: Pending): TreeNode[] {
  const { id: by, requires, recommends = [] } = use.module;
  return recommends
    .filter(id => !requires.includes(id))
    .map(id => ({ id, title: modules.get(id)?.module.title ?? pending.get(`module:${id}`)?.title ?? id }))
    .sort(byTitle)
    .map(({ id, title }): TreeNode => {
      const installed = modules.get(id);
      const planned = pending.get(`module:${id}`);
      return {
        segment: `recommends:module:${id}`,
        selection: { kind: 'module', module: id },
        title,
        recommendedBy: `module:${by}`,
        ...(installed !== undefined
          ? {
              version: installed.module.version,
              installed: true,
              ...(installed.worlds.length > 0 && { status: IN_USE }),
            }
          : planned === undefined
            ? { status: MISSING }
            : { version: planned.version, pending: true }),
        children: () => [],
      };
    });
}

/**
 * The modules a module requires, by title, each as installed, with the modules it requires in turn.
 * @param path - The IDs of the module, first, and of the modules it is under, none of which shows again under it
 * @param world - The world it is under, if any
 * @param modules - The installed modules, by ID
 * @param pending - The packages the plan installs anew, of which one required shows as pending
 * @returns Their nodes; none if the module is not installed, as only its manifest says what it requires
 */
function requirementNodes(
  path: readonly [string, ...string[]],
  world: string | undefined,
  modules: ReadonlyMap<string, ModuleUse>,
  pending: Pending,
): TreeNode[] {
  const requires = modules.get(path[0])?.module.requires ?? [];
  return requires
    .filter(required => !path.includes(required))
    .map(required => ({
      id: required,
      title: modules.get(required)?.module.title ?? pending.get(`module:${required}`)?.title ?? required,
    }))
    .sort(byTitle)
    .map(({ id, title }): TreeNode => {
      const use = modules.get(id);
      const installed = use?.module;
      const planned = pending.get(`module:${id}`);
      return {
        segment: `module:${id}`,
        selection: { kind: 'module', module: id, ...(world !== undefined && { world }) },
        title,
        ...(installed !== undefined
          ? {
              version: installed.version,
              installed: true,
              ...(installed.locked && { locked: true }),
              ...(use !== undefined && use.worlds.length > 0 && { status: IN_USE }),
            }
          : planned === undefined
            ? { status: MISSING }
            : { version: planned.version, pending: true }),
        children: () => requirementNodes([id, ...path], world, modules, pending),
      };
    });
}

/**
 * A module the plan installs anew, as the modules' groups show it. What it requires is not known until it is installed,
 * though the plan installs that too.
 * @param entry - The module
 * @returns Its node
 */
function pendingNode(entry: PendingPackage & { id: string }): TreeNode {
  return {
    segment: `module:${entry.id}`,
    selection: { kind: 'module', module: entry.id },
    title: entry.title,
    version: entry.version,
    pending: true,
    children: () => [],
  };
}

/**
 * The modules, grouped: those for any game system, then those for each system, by the system's title. The modules the
 * plan installs anew follow those installed in each group, and a game system the plan installs has a group, though
 * none yet, so that the modules for it can be found there.
 * @param overview - The installation
 * @param modules - The installed modules, by ID
 * @param pending - The packages the plan installs anew
 * @returns The groups' nodes, leaving out any without modules but those of the game systems the plan installs
 */
function groupNodes(overview: Overview, modules: ReadonlyMap<string, ModuleUse>, pending: Pending): TreeNode[] {
  const titles = new Map(overview.systems.map(({ id, title }) => [id, title]));
  const plannedSystems = new Map(pendingOf(pending, 'system').map(({ id, title }) => [id, title]));
  const planned = pendingOf(pending, 'module').filter(({ id }) => !modules.has(id));
  const universal = overview.modules.filter(({ module: pkg }) => pkg.systems.length === 0);
  const plannedUniversal = planned.filter(({ systems }) => systems.length === 0);
  const forSystems = [
    ...new Set([
      ...overview.modules.flatMap(({ module: pkg }) => pkg.systems),
      ...planned.flatMap(({ systems }) => systems),
      ...plannedSystems.keys(),
    ]),
  ]
    .map(id => ({ id, title: titles.get(id) ?? plannedSystems.get(id) ?? id }))
    .sort(byTitle);
  const groups: TreeNode[] = forSystems.map(({ id, title }) => ({
    segment: `system:${id}`,
    selection: { kind: 'group', system: id },
    title,
    ...(titles.has(id) ? {} : plannedSystems.has(id) ? { pending: true } : { status: MISSING }),
    children: () => [
      ...overview.modules
        .filter(({ module: pkg }) => pkg.systems.includes(id))
        .map(use => installedNode(use, modules, pending)),
      ...planned.filter(({ systems }) => systems.includes(id)).map(pendingNode),
    ],
  }));
  if (universal.length === 0 && plannedUniversal.length === 0) return groups;
  return [
    {
      segment: 'universal',
      selection: { kind: 'group' },
      title: localize('Tree.Universal'),
      children: () => [
        ...universal.map(use => installedNode(use, modules, pending)),
        ...plannedUniversal.map(pendingNode),
      ],
    },
    ...groups,
  ];
}

/**
 * The package a row shows, as the resolver names it: Foundry VTT itself for the root.
 * @param selection - The row's selection
 * @returns `core`, `system:<id>` or `module:<id>`, or `undefined` for a row that shows no package
 */
export function packageOf(selection: TreeSelection): string | undefined {
  if (selection.kind === 'root') return 'core';
  if (selection.kind === 'system') return `system:${selection.system}`;
  if (selection.kind === 'module') return `module:${selection.module}`;
  return undefined;
}

/**
 * The key EMMA ignores a row's world, game system or module by.
 * @param selection - The row's selection
 * @returns `world:<id>`, `system:<id>` or `module:<id>`, or `undefined` for a row that cannot be ignored
 */
export function ignoreKeyOf(selection: TreeSelection): string | undefined {
  return selection.kind === 'world'
    ? `world:${selection.world}`
    : selection.kind === 'root'
      ? undefined
      : packageOf(selection);
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

/**
 * The keys of the rows a row is under, from the top: those to expand to show it.
 * @param key - The row's key
 * @returns The keys
 */
export function ancestorsOf(key: string): string[] {
  const parts = key.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

/**
 * The first row whose title has some text, ignoring case, as the finder looks for it.
 * @param rows - The rows, in order
 * @param text - The text
 * @returns The row, or `undefined` if none has it, or the text is empty
 */
export function findRow(rows: readonly TreeRow[], text: string): TreeRow | undefined {
  const wanted = text.toLocaleLowerCase();
  return wanted === '' ? undefined : rows.find(({ title }) => title.toLocaleLowerCase().includes(wanted));
}

/**
 * The row a panel's link goes to: the first showing what it names, but for a package, not one under a world, where a
 * module or game system shows as the world last ran with it.
 * @param rows - The rows, in order
 * @param link - What the link names, as a row's selection
 * @returns The row, or `undefined` if none shows it
 */
export function rowFor(rows: readonly TreeRow[], link: TreeSelection): TreeRow | undefined {
  const same = (row: TreeRow) => JSON.stringify(row.selection) === JSON.stringify(link);
  return rows.find(row => same(row) && row.recommendedBy === undefined) ?? rows.find(same);
}
