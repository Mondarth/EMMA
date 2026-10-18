import type { ModuleEntry } from '@module/adapters/modules';

/** How a grouped module relates to the module it is grouped under. */
export type Relation = 'required' | 'recommended';

/** One row of a grouped list of modules. A module grouped under several parents has a row under each. */
export interface ModuleRow {
  /** Unique within the list: the IDs of the module and the parents it is grouped under, from the top. */
  readonly key: string;
  readonly entry: ModuleEntry;
  /** How deeply the row is grouped: 0 for a module at its own place in the list. */
  readonly depth: number;
  /** How the module relates to the row it is grouped under, or `null` at its own place. */
  readonly relation: Relation | null;
}

/**
 * The installed modules a module requires, then those it recommends and does not also require, each in display
 * order. Packages that are not installed modules are left out, since they cannot be shown.
 * @param entry - The module
 * @param entries - Every installed module, in display order
 * @returns The related modules, by relation
 */
export function relatedModules(entry: ModuleEntry, entries: readonly ModuleEntry[]): Record<Relation, ModuleEntry[]> {
  const recommends = entry.relationships.recommends.filter(({ type }) => type === 'module').map(({ id }) => id);
  const others = entries.filter(({ id }) => id !== entry.id);
  const required = others.filter(({ id }) => entry.requires.includes(id));
  const recommended = others.filter(other => recommends.includes(other.id) && !required.includes(other));
  return { required, recommended };
}

/**
 * Group modules under the parents that relate to them. Under each parent (a module for which `isParent` is true) come
 * the modules it requires, then those it recommends, each in display order; a grouped module that is itself a parent
 * has its own group under it, following the chain. A module grouped under any parent is shown only there, once under
 * each such parent, rather than at its own place. Modules that only require each other in a loop are shown at their
 * own place, with the loop cut where it would repeat.
 * @param entries - The modules to group, in display order
 * @param isParent - Whether a module's related modules are grouped under it
 * @returns The rows, in display order
 */
export function groupRows(entries: readonly ModuleEntry[], isParent: (id: string) => boolean): ModuleRow[] {
  const grouped = new Set(
    entries
      .filter(({ id }) => isParent(id))
      .flatMap(entry => Object.values(relatedModules(entry, entries)).flat())
      .map(({ id }) => id),
  );

  const rows: ModuleRow[] = [];
  const placed = new Set<string>();

  /**
   * Add a module's row, then the rows grouped under it.
   * @param entry - The module
   * @param relation - How it relates to the row above it, or `null` at its own place
   * @param ancestors - The IDs of the rows it is grouped under, from the top
   * @param out - Where to add the rows
   */
  const visit = (
    entry: ModuleEntry,
    relation: Relation | null,
    ancestors: readonly string[],
    out: ModuleRow[],
  ): void => {
    const path = [...ancestors, entry.id];
    out.push({ key: path.join('/'), entry, depth: ancestors.length, relation });
    placed.add(entry.id);
    if (!isParent(entry.id)) return;
    const { required, recommended } = relatedModules(entry, entries);
    for (const [childRelation, children] of [
      ['required', required],
      ['recommended', recommended],
    ] as const) {
      for (const child of children) if (!path.includes(child.id)) visit(child, childRelation, path, out);
    }
  };

  // The modules at their own place: those not grouped under any parent, then, in display order, any module that
  // would otherwise not be shown because it is grouped only within a loop.
  const tops = new Set(entries.filter(({ id }) => !grouped.has(id)));
  for (const entry of tops) visit(entry, null, [], []);
  for (const entry of entries) {
    if (placed.has(entry.id)) continue;
    tops.add(entry);
    visit(entry, null, [], []);
  }

  for (const entry of entries) if (tops.has(entry)) visit(entry, null, [], rows);
  return rows;
}

/**
 * The inactive modules that conflict with an active one, whichever of the two declares the conflict.
 * @param entries - The installed modules
 * @param isActive - Whether a module will be active
 * @returns The IDs of the inactive modules in conflict
 */
export function conflictedModules(entries: readonly ModuleEntry[], isActive: (id: string) => boolean): Set<string> {
  const conflicts = new Map(
    entries.map(({ id, relationships }) => [
      id,
      relationships.conflicts.filter(({ type }) => type === 'module').map(({ id: other }) => other),
    ]),
  );
  const active = entries.filter(({ id }) => isActive(id)).map(({ id }) => id);
  return new Set(
    entries
      .filter(({ id }) => !isActive(id))
      .filter(({ id }) =>
        active.some(
          other => other !== id && (conflicts.get(other)?.includes(id) || conflicts.get(id)?.includes(other)),
        ),
      )
      .map(({ id }) => id),
  );
}

/**
 * Some modules with the modules they require among `entries`, and those modules' requirements in turn.
 * @param entries - The modules to look among, in display order
 * @param from - The IDs of the modules to start from
 * @param skip - Whether to leave a required module out, along with what only it requires
 * @returns The IDs of the modules and their requirements, in display order
 */
export function withRequired(
  entries: readonly ModuleEntry[],
  from: Iterable<string>,
  skip: (id: string) => boolean,
): string[] {
  const found = new Set(from);
  const queue = entries.filter(({ id }) => found.has(id));
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const required of relatedModules(next, entries).required) {
      if (found.has(required.id) || skip(required.id)) continue;
      found.add(required.id);
      queue.push(required);
    }
  }
  return entries.filter(({ id }) => found.has(id)).map(({ id }) => id);
}
