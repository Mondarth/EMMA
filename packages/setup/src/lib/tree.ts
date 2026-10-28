/**
 * The installation tree: the root, the worlds under it, and under each world the modules its record says it runs.
 * Pure: which rows are showing, and where the keyboard moves between them.
 */
import type { ModuleStatus, Overview, WorldStatus } from './overview';

/** What is selected in the tree, and so shown in the panel beside it. */
export type TreeSelection =
  | { readonly kind: 'root' }
  | { readonly kind: 'world'; readonly world: string }
  | { readonly kind: 'module'; readonly world: string; readonly module: string };

/** A row of the tree. */
export interface TreeRow {
  /** Unique within the tree; also the key of a row that can be expanded. */
  readonly key: string;
  /** 1 for the root, 2 for a world, 3 for a module. */
  readonly level: 1 | 2 | 3;
  readonly selection: TreeSelection;
  readonly title: string;
  /** The version shown beside the title, if any. */
  readonly version?: string;
  readonly status?: WorldStatus | ModuleStatus;
  /** Whether the row has rows under it. */
  readonly expandable: boolean;
  /** The key of the row it is under, if any. */
  readonly parent?: string;
}

/** The root row's key. */
export const ROOT = 'root';

/**
 * The key of a selection's row.
 * @param selection - The selection
 * @returns Its row's key
 */
export function keyOf(selection: TreeSelection): string {
  switch (selection.kind) {
    case 'root':
      return ROOT;
    case 'world':
      return `world:${selection.world}`;
    case 'module':
      return `module:${selection.world}:${selection.module}`;
  }
}

/**
 * The rows showing, from the top: those under a row show only while it is expanded.
 * @param overview - The installation
 * @param expanded - The keys of the rows expanded
 * @returns The rows, in order
 */
export function visibleRows(overview: Overview, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [
    { key: ROOT, level: 1, selection: { kind: 'root' }, title: '', version: overview.core, expandable: true },
  ];
  if (!expanded.has(ROOT)) return rows;
  for (const { world, status, modules } of overview.worlds) {
    const selection: TreeSelection = { kind: 'world', world: world.id };
    const key = keyOf(selection);
    rows.push({ key, level: 2, selection, title: world.title, status, expandable: modules.length > 0, parent: ROOT });
    if (!expanded.has(key)) continue;
    for (const entry of modules) {
      const moduleSelection: TreeSelection = { kind: 'module', world: world.id, module: entry.id };
      rows.push({
        key: keyOf(moduleSelection),
        level: 3,
        selection: moduleSelection,
        title: entry.title,
        version: entry.recorded,
        status: entry.status,
        expandable: false,
        parent: key,
      });
    }
  }
  return rows;
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
