/**
 * What the update plan offers to keep before it changes anything: a snapshot of the whole installation, and a backup of
 * each world that uses a package the plan changes. Each is offered unchecked, as a reminder, but the snapshot is
 * checked when the plan changes Foundry VTT itself, as a strong recommendation; the user may change either, and write
 * the note Foundry keeps with it.
 */
import type { Overview } from './overview';
import type { PlanEntry } from './plans';

/** The key of the snapshot among the safeguards. */
export const SNAPSHOT = 'snapshot';

/**
 * The key of a world's backup among the safeguards.
 * @param world - The world's ID
 * @returns The key
 */
export function backupKey(world: string): string {
  return `world:${world}`;
}

/** A snapshot or backup the plan offers. */
export interface Safeguard {
  /** {@link SNAPSHOT}, or the world's {@link backupKey}. */
  readonly key: string;
  readonly kind: 'snapshot' | 'backup';
  /** The world backed up; none for the snapshot. */
  readonly world?: { readonly id: string; readonly title: string };
  /** The packages the plan changes that the world uses, by title; none for the snapshot. */
  readonly packages?: readonly string[];
  /** Whether it is to be made. */
  readonly checked: boolean;
  /** Whether EMMA recommends it: the snapshot, when the plan changes Foundry VTT. */
  readonly recommended: boolean;
  /** The note Foundry keeps with it. */
  readonly note: string;
}

/** What the user changed of a safeguard. */
export interface SafeguardEdit {
  readonly checked?: boolean;
  readonly note?: string;
}

/** The notes a safeguard has until the user writes another. */
export interface SafeguardNotes {
  readonly snapshot: string;
  /**
   * @param packages - The packages the plan changes that the world uses, by title
   * @returns The note of the world's backup
   */
  readonly backup: (packages: readonly string[]) => string;
}

/**
 * The safeguards a plan offers, in the order they come in it: the snapshot, then each world's backup, before any
 * package changes.
 * @param overview - The installation
 * @param plan - The plan's changes
 * @param edits - What the user changed, by key
 * @param notes - The notes until the user writes others
 * @param titleOf - A package's title, by its key
 * @returns The safeguards; none for an empty plan
 */
export function safeguardsFor(
  overview: Overview,
  plan: readonly PlanEntry[],
  edits: ReadonlyMap<string, SafeguardEdit>,
  notes: SafeguardNotes,
  titleOf: (key: string) => string,
): Safeguard[] {
  if (plan.length === 0) return [];
  const changed = new Set(plan.map(({ key }) => key));
  const recommended = changed.has('core');
  const snapshot = edits.get(SNAPSHOT);
  const backups = overview.worlds.flatMap(({ world, modules, needs }): Safeguard[] => {
    // What the world uses: its system, the modules its record says it runs, and those it will need when next run. A
    // world without a record is known to use its system alone.
    const uses = [`system:${world.system}`, ...[...modules, ...needs].map(({ id }) => `module:${id}`)];
    const packages = [...new Set(uses.filter(used => changed.has(used)))].map(titleOf);
    if (packages.length === 0) return [];
    const key = backupKey(world.id);
    const edit = edits.get(key);
    return [
      {
        key,
        kind: 'backup',
        world: { id: world.id, title: world.title },
        packages,
        checked: edit?.checked ?? false,
        recommended: false,
        note: edit?.note ?? notes.backup(packages),
      },
    ];
  });
  return [
    {
      key: SNAPSHOT,
      kind: 'snapshot',
      checked: snapshot?.checked ?? recommended,
      recommended,
      note: snapshot?.note ?? notes.snapshot,
    },
    ...backups,
  ];
}
