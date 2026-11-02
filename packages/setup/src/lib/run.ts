/**
 * Running an update plan: the steps it takes, in order. First the snapshot and backups the user checked, then each
 * package change, in the plan's order, uninstalling last. Foundry VTT's own update ends the run: updating Foundry in place restarts it,
 * and is the user's to do with care (see `docs/extension.md`), so the steps after it wait for another run.
 */
import { format, localize } from './i18n';
import type { PlanEntry } from './plans';
import { UNINSTALL } from './plans';
import type { Safeguard } from './safeguards';

/** One step of a run. */
export type RunStep =
  | { readonly kind: 'snapshot'; readonly key: string; readonly note: string }
  | {
      readonly kind: 'backup';
      readonly key: string;
      readonly world: { readonly id: string; readonly title: string };
      readonly note: string;
    }
  | {
      readonly kind: 'install';
      readonly key: string;
      readonly type: 'module' | 'system';
      readonly id: string;
      readonly title: string;
      readonly version: string;
      /** The manifest URL to install the version from; none if the plan found none, which fails the step. */
      readonly manifest?: string;
    }
  | {
      readonly kind: 'uninstall';
      readonly key: string;
      readonly type: 'module' | 'system';
      readonly id: string;
      readonly title: string;
    }
  | { readonly kind: 'core'; readonly key: 'core'; readonly version: string };

/** How far a step of a run has got. */
export type StepState = 'waiting' | 'running' | 'done' | 'failed';

/**
 * The steps that running a plan takes, in order.
 * @param safeguards - The plan's snapshot and backups; only those checked are made
 * @param plan - The plan's changes, in the order to install them
 * @param titleOf - A package's title, by its key
 * @returns The steps
 */
export function runSteps(
  safeguards: readonly Safeguard[],
  plan: readonly PlanEntry[],
  titleOf: (key: string) => string,
): RunStep[] {
  const kept = safeguards
    .filter(({ checked }) => checked)
    .map(({ key, world, note }): RunStep =>
      world === undefined ? { kind: 'snapshot', key, note } : { kind: 'backup', key, world, note },
    );
  const changes = plan.map(({ key, version, manifest }): RunStep => {
    if (key === 'core') return { kind: 'core', key, version };
    const type = key.startsWith('system:') ? 'system' : 'module';
    const named = { key, type, id: key.slice(key.indexOf(':') + 1), title: titleOf(key) } as const;
    if (version === UNINSTALL) return { kind: 'uninstall', ...named };
    return {
      kind: 'install',
      ...named,
      version,
      ...(manifest !== undefined && { manifest }),
    };
  });
  return [...kept, ...changes];
}

/**
 * A step, in words.
 * @param step - The step
 * @returns What it does
 */
export function stepText(step: RunStep): string {
  switch (step.kind) {
    case 'snapshot':
      return localize('Run.StepSnapshot');
    case 'backup':
      return format('Run.StepBackup', { world: step.world.title });
    case 'install':
      return format('Run.StepInstall', { title: step.title, version: step.version });
    case 'uninstall':
      return format('Run.StepUninstall', { title: step.title });
    default:
      return format('Run.StepCore', { version: step.version });
  }
}
