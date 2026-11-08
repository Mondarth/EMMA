/**
 * What is held as it is, as the root's panel lists it: what is locked, and what is ignored, each linked to its row.
 */
import { localize } from './i18n';
import type { Overview } from './overview';
import { byTitle } from './overview';
import type { TreeSelection } from './tree';

/**
 * Items by title, and by key where two share one.
 * @param a - An item
 * @param b - Another
 * @returns Their order
 */
const inOrder = (a: HeldItem, b: HeldItem): number =>
  byTitle({ id: a.key, title: a.title }, { id: b.key, title: b.title });

/**
 * The row of the tree a package, or Foundry VTT, shows as, by its key.
 * @param key - Its key: `core`, `system:<id>` or `module:<id>`
 * @returns The row
 */
export function linkOf(key: string): TreeSelection {
  if (key === 'core') return { kind: 'root' };
  const id = key.slice(key.indexOf(':') + 1);
  return key.startsWith('system:') ? { kind: 'system', system: id } : { kind: 'module', module: id };
}

/** Something pinned, at its version, and why the plan leaves it out, if it does. */
export interface PinnedItem extends HeldItem {
  readonly version: string;
  /** Why the plan leaves it out, in words, if it does. */
  readonly problem?: string;
}

/** Something locked or ignored. */
export interface HeldItem {
  /** Its key, as locking and ignoring name it: `core`, `world:<id>`, `system:<id>` or `module:<id>`. */
  readonly key: string;
  readonly title: string;
  /** Its row in the tree. */
  readonly link: TreeSelection;
}

/**
 * What is locked: Foundry VTT, where EMMA locks it, then the game systems and modules locked in Foundry, by title.
 * @param overview - The installation
 * @returns Each
 */
export function lockedItems(overview: Overview): HeldItem[] {
  const packages = [
    ...overview.systems
      .filter(({ locked }) => locked === true)
      .map(({ id, title }) => ({ key: `system:${id}`, title, link: { kind: 'system', system: id } as const })),
    ...overview.modules
      .filter(({ module: { locked } }) => locked === true)
      .map(({ module: { id, title } }) => ({
        key: `module:${id}`,
        title,
        link: { kind: 'module', module: id } as const,
      })),
  ].sort(inOrder);
  const core = { key: 'core', title: localize('Tree.Root'), link: { kind: 'root' } as const };
  return overview.coreLocked === true ? [core, ...packages] : packages;
}

/**
 * What is ignored: worlds, game systems and modules, a phantom module that only a world's record names among them, by
 * title, each as the installation, or else a world's record, names it.
 * @param overview - The installation
 * @returns Each
 */
export function ignoredItems(overview: Overview): HeldItem[] {
  const recorded = new Map(overview.worlds.flatMap(({ modules }) => modules.map(entry => [entry.id, entry.title])));
  return (overview.ignored ?? [])
    .map((key): HeldItem => {
      const id = key.slice(key.indexOf(':') + 1);
      if (key.startsWith('world:')) {
        const world = overview.worlds.find(({ world: { id: other } }) => other === id)?.world;
        return { key, title: world?.title ?? id, link: { kind: 'world', world: id } };
      }
      if (key.startsWith('system:')) {
        const system = overview.systems.find(({ id: other }) => other === id);
        return { key, title: system?.title ?? id, link: { kind: 'system', system: id } };
      }
      const title =
        overview.modules.find(({ module: installed }) => installed.id === id)?.module.title ?? recorded.get(id) ?? id;
      return { key, title, link: { kind: 'module', module: id } };
    })
    .sort(inOrder);
}
