/**
 * What uninstalling a game system or module would break. In standard mode, EMMA refuses an uninstall that would break
 * something known: a world's game system, a module a recorded world runs or will need when next run, a module another
 * installed module requires, unless that one is uninstalled too, or a package locked in Foundry. What it cannot know
 * it only warns of: a world without a record may run the module, and modules for a system uninstalled are left with no
 * system they run in. Pure: it works on plain values only.
 */
import { format, localize } from './i18n';
import type { Overview } from './overview';

/** Why an uninstall is refused. */
export type UninstallBlock =
  | { readonly kind: 'locked' }
  | { readonly kind: 'world-system'; readonly world: string }
  | { readonly kind: 'world-module'; readonly world: string; readonly needed: boolean }
  | { readonly kind: 'required'; readonly by: string };

/** What an uninstall may break, that EMMA cannot know. */
export type UninstallWarning =
  { readonly kind: 'unrecorded'; readonly world: string } | { readonly kind: 'orphaned'; readonly module: string };

/** What uninstalling a package would do. */
export interface UninstallEffects {
  /** Why it is refused; none if it is not. */
  readonly blocks: readonly UninstallBlock[];
  readonly warnings: readonly UninstallWarning[];
}

/**
 * What uninstalling a package would break.
 * @param overview - The installation
 * @param key - The package, `system:<id>` or `module:<id>`
 * @param removing - The packages the plan uninstalls besides, by key
 * @returns What it would break; nothing for a package not installed
 */
export function uninstallEffects(overview: Overview, key: string, removing: readonly string[]): UninstallEffects {
  const id = key.slice(key.indexOf(':') + 1);
  const blocks: UninstallBlock[] = [];
  const warnings: UninstallWarning[] = [];
  const kept = overview.modules
    .map(({ module: other }) => other)
    .filter(other => !removing.includes(`module:${other.id}`) && other.id !== id);

  if (key.startsWith('system:')) {
    const system = overview.systems.find(installed => installed.id === id);
    if (system === undefined) return { blocks, warnings };
    if (system.locked === true) blocks.push({ kind: 'locked' });
    for (const { world } of overview.worlds) {
      if (world.system === id) blocks.push({ kind: 'world-system', world: world.title });
    }
    const left = new Set(
      overview.systems
        .filter(other => other.id !== id && !removing.includes(`system:${other.id}`))
        .map(other => other.id),
    );
    for (const other of kept) {
      if (other.systems.includes(id) && !other.systems.some(runsIn => left.has(runsIn))) {
        warnings.push({ kind: 'orphaned', module: other.title });
      }
    }
    return { blocks, warnings };
  }

  const use = overview.modules.find(({ module: installed }) => installed.id === id);
  if (use === undefined) return { blocks, warnings };
  if (use.module.locked === true) blocks.push({ kind: 'locked' });
  for (const world of overview.worlds) {
    if (!use.worlds.includes(world.world.id)) continue;
    blocks.push({ kind: 'world-module', world: world.world.title, needed: use.needed.includes(world.world.id) });
  }
  for (const other of kept) {
    if (other.requires.includes(id)) blocks.push({ kind: 'required', by: other.title });
  }
  for (const { world, record } of overview.worlds) {
    // A world without a record may run any module for its system.
    const fits = use.module.systems.length === 0 || use.module.systems.includes(world.system);
    if (record === undefined && fits) warnings.push({ kind: 'unrecorded', world: world.title });
  }
  return { blocks, warnings };
}

/**
 * Why an uninstall is refused, in words.
 * @param block - Why
 * @returns One sentence
 */
export function blockText(block: UninstallBlock): string {
  switch (block.kind) {
    case 'locked':
      return localize('Uninstall.Locked');
    case 'world-system':
      return format('Uninstall.WorldSystem', { world: block.world });
    case 'world-module':
      return format(block.needed ? 'Uninstall.WorldNeeds' : 'Uninstall.WorldRuns', { world: block.world });
    default:
      return format('Uninstall.Required', { module: block.by });
  }
}

/**
 * What an uninstall may break, in words.
 * @param warning - What
 * @returns One sentence
 */
export function warningText(warning: UninstallWarning): string {
  return warning.kind === 'unrecorded'
    ? format('Uninstall.Unrecorded', { world: warning.world })
    : format('Uninstall.Orphaned', { module: warning.module });
}
