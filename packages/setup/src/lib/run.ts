/**
 * Running an update plan: the steps it takes, in order, and how they are run (see {@link runSteps} and
 * {@link runScheduled}). First the snapshot and backups the user checked, then each package change, uninstalling last.
 * Foundry VTT's own update ends the run: updating Foundry in place restarts it, and is the user's to do with care (see
 * `docs/extension.md`), so the steps after it wait for another run.
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
      /** The other steps it waits for, and does not run without (see `PlanEntry.after`). */
      readonly after?: readonly string[];
      /** Added against EMMA's advice: run after every other install, whatever became of them. */
      readonly forced?: true;
    }
  | {
      readonly kind: 'uninstall';
      readonly key: string;
      readonly type: 'module' | 'system';
      readonly id: string;
      readonly title: string;
      /** The other steps it waits for, and does not run without (see `PlanEntry.after`). */
      readonly after?: readonly string[];
    }
  | { readonly kind: 'core'; readonly key: 'core'; readonly version: string };

/** How far a step of a run has got: `skipped` if it was not run, as a step it needs failed, or was not run either. */
export type StepState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

/**
 * How far an install has got, as Foundry tells it: downloading the package, then installing it, which is extracting its
 * files, each from 0 to 100 per cent of that phase.
 */
export interface StepProgress {
  readonly phase: 'download' | 'install';
  /** How much of the phase is done, in whole per cent. */
  readonly pct: number;
}

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
  const changes = plan.map(({ key, version, manifest, after, forced }): RunStep => {
    if (key === 'core') return { kind: 'core', key, version };
    const type = key.startsWith('system:') ? 'system' : 'module';
    const named = {
      key,
      type,
      id: key.slice(key.indexOf(':') + 1),
      title: titleOf(key),
      ...(after !== undefined && { after }),
    } as const;
    if (version === UNINSTALL) return { kind: 'uninstall', ...named };
    return {
      kind: 'install',
      ...named,
      version,
      ...(manifest !== undefined && { manifest }),
      ...(forced === true && { forced }),
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

/** How many installs run at once, at most, as Foundry VTT's own **Update All** runs its updates. */
export const INSTALLS_AT_ONCE = 5;

/** What becomes of a step as it is run. */
export interface ScheduleHooks {
  /** Carry the step out: resolves once it is done, rejects if it fails. */
  readonly run: (step: Exclude<RunStep, { kind: 'core' }>) => Promise<void>;
  /** The step has started. */
  readonly onStart: (step: Exclude<RunStep, { kind: 'core' }>) => void;
  /** The step is done. */
  readonly onDone: (step: Exclude<RunStep, { kind: 'core' }>) => void;
  /** The step failed. */
  readonly onFail: (step: Exclude<RunStep, { kind: 'core' }>, error: unknown) => void;
  /** The step is not run, as the steps given, which it needs, failed or were not run either. */
  readonly onSkip: (step: Exclude<RunStep, { kind: 'core' }>, needed: readonly RunStep[]) => void;
}

/**
 * Run a plan's steps, none of them Foundry VTT's own update, in stages:
 *
 * 1. the snapshot and backups, one at a time;
 * 2. the installs and updates, up to {@link INSTALLS_AT_ONCE} at once, each once the steps it waits for are done;
 * 3. what was added against EMMA's advice, in the same way, once every other install is over, whatever became of it;
 * 4. the uninstalls, one at a time, each once the steps it waits for are done.
 *
 * A step that fails stops only the steps that need it, and those that need them in turn: they are not run. Every change
 * needs the snapshot and backups, so that nothing changes without what the user asked to keep first. Every other step
 * goes on.
 * @param steps - The steps
 * @param hooks - How to carry each out, and what to tell of it
 * @returns Once every step is done, has failed, or is not run
 */
export async function runScheduled(
  steps: readonly Exclude<RunStep, { kind: 'core' }>[],
  hooks: ScheduleHooks,
): Promise<void> {
  const outcomes = new Map<string, 'done' | 'failed' | 'skipped'>();
  const byKey = new Map(steps.map(step => [step.key, step]));
  const safeguards = steps.filter(({ kind }) => kind === 'snapshot' || kind === 'backup');
  /**
   * The steps a step needs: for a change, the snapshot and backups, and the steps it waits for that are in the run.
   * @param step - The step
   * @returns Their keys
   */
  const needs = (step: Exclude<RunStep, { kind: 'core' }>): string[] =>
    step.kind === 'snapshot' || step.kind === 'backup'
      ? []
      : [...safeguards.map(({ key }) => key), ...(step.after ?? []).filter(key => byKey.has(key))];
  const stages = [
    { steps: safeguards, limit: 1 },
    { steps: steps.filter(step => step.kind === 'install' && step.forced !== true), limit: INSTALLS_AT_ONCE },
    { steps: steps.filter(step => step.kind === 'install' && step.forced === true), limit: INSTALLS_AT_ONCE },
    { steps: steps.filter(({ kind }) => kind === 'uninstall'), limit: 1 },
  ];
  for (const stage of stages) await runStage(stage.steps, stage.limit);

  /**
   * Run a stage's steps, as many at once as it may, each as soon as what it needs is done.
   * @param staged - The stage's steps, in order
   * @param limit - How many may run at once
   */
  async function runStage(staged: readonly Exclude<RunStep, { kind: 'core' }>[], limit: number): Promise<void> {
    const waiting = [...staged];
    const running = new Set<Promise<void>>();
    const skip = (step: Exclude<RunStep, { kind: 'core' }>, needed: readonly string[]): void => {
      outcomes.set(step.key, 'skipped');
      hooks.onSkip(
        step,
        needed.flatMap(key => byKey.get(key) ?? []),
      );
    };
    while (waiting.length > 0 || running.size > 0) {
      for (const step of [...waiting]) {
        const needed = needs(step);
        const stopped = needed.filter(key => outcomes.get(key) === 'failed' || outcomes.get(key) === 'skipped');
        if (stopped.length > 0) {
          waiting.splice(waiting.indexOf(step), 1);
          skip(step, stopped);
        } else if (running.size < limit && needed.every(key => outcomes.get(key) === 'done')) {
          waiting.splice(waiting.indexOf(step), 1);
          start(step);
        }
      }
      if (running.size === 0) {
        // What is left waits for steps that never come: not in an earlier stage, nor in this one.
        for (const step of waiting)
          skip(
            step,
            needs(step).filter(key => outcomes.get(key) !== 'done'),
          );
        return;
      }
      await Promise.race(running);
    }

    /**
     * Start a step, counting it as running until it settles.
     * @param step - The step
     */
    function start(step: Exclude<RunStep, { kind: 'core' }>): void {
      hooks.onStart(step);
      const settled: Promise<void> = hooks
        .run(step)
        .then(
          () => {
            outcomes.set(step.key, 'done');
            hooks.onDone(step);
          },
          (error: unknown) => {
            outcomes.set(step.key, 'failed');
            hooks.onFail(step, error);
          },
        )
        .finally(() => {
          running.delete(settled);
        });
      running.add(settled);
    }
  }
}
