/**
 * What the setup screen's EMMA window shows: the installation as last read, its updates, and whether EMMA guards
 * Foundry's own package buttons. Reactive, with Svelte 5 runes, so the window follows any change.
 */
import type { SnapshotSpace } from '../foundry/setup-game';
import type { Overview } from '../lib/overview';
import type { RunStep, StepState } from '../lib/run';
import { runSteps } from '../lib/run';
import type { UpdateSearch } from '../lib/updates';
import { UpdateState } from './update-state.svelte';

/** How the state reads the installation and keeps the guard's setting. */
export interface SetupStateOptions {
  /** Read the installation and the worlds' records afresh. */
  readonly load: () => Promise<Overview>;
  /** Whether the guard was on when the screen was last left. */
  readonly guardOn: boolean;
  /** Keep the guard's setting, and show it on the screen. */
  readonly onGuardChange: (on: boolean) => void;
  /**
   * Search for the updates of the installation, each time it is read; failing with a `KitUnavailable` when the EMMA
   * module's setup kit cannot be used.
   */
  readonly findUpdates: (overview: Overview) => Promise<UpdateSearch>;
  /** Install the EMMA module, or update it, which the search for updates needs. */
  readonly installModule: () => Promise<void>;
  /** Ask how much space a snapshot needs, and how much is free; none where it cannot be asked. */
  readonly snapshotSpace?: () => Promise<SnapshotSpace>;
  /** Carry out a step of the update plan, failing with why; none where the plan cannot be run. */
  readonly runStep?: (step: Exclude<RunStep, { kind: 'core' }>) => Promise<void>;
}

/** A run of the update plan, going on or done. */
export interface PlanRun {
  /** Its steps, in order. */
  readonly steps: readonly RunStep[];
  /** How far each step has got, by its key. */
  readonly states: Readonly<Record<string, StepState>>;
  /** Whether it is over: done, failed, or stopped before Foundry VTT's update. */
  readonly over: boolean;
  /** The step that failed, and why. */
  readonly failure?: { readonly step: RunStep; readonly message: string };
  /** The version of Foundry VTT it stopped before updating to. */
  readonly beforeCore?: string;
}

/** Whether the space a snapshot needs is known: `checking`, `failed`, or the space; `null` before it is asked. */
export type SnapshotSpaceState = SnapshotSpace | 'checking' | 'failed' | null;

/** What the window shows. */
export class SetupState {
  /** The installation, once read. */
  overview = $state<Overview | null>(null);
  /** Whether the installation is being read. */
  loading = $state(false);
  /** Whether the last reading failed. */
  failed = $state(false);
  /** Whether the EMMA module is being installed or updated. */
  installing = $state(false);
  /** Whether EMMA guards Foundry's own Install, Update and Update All buttons. */
  guardOn = $state(true);
  /** The installation's updates, searched for each time it is read. */
  readonly updates: UpdateState;
  /** The space a snapshot needs and the space free, once asked, until the installation is read again. */
  snapshotSpace = $state.raw<SnapshotSpaceState>(null);
  /** The last run of the update plan, until the next. */
  run = $state.raw<PlanRun | null>(null);

  /**
   * Whether the update plan can be run here.
   * @returns `true` where it can
   */
  get canRun(): boolean {
    return this.#options.runStep !== undefined;
  }

  /**
   * Whether the update plan is being run.
   * @returns `true` while it is
   */
  get running(): boolean {
    return this.run !== null && !this.run.over;
  }

  readonly #options: SetupStateOptions;

  /**
   * @param options - How the state reads the installation and keeps the guard's setting
   */
  constructor(options: SetupStateOptions) {
    this.#options = options;
    this.guardOn = options.guardOn;
    this.updates = new UpdateState(options.findUpdates);
  }

  /**
   * Read the installation afresh, then search for its updates in the background. A failure is kept in {@link failed},
   * or in the updates' status, never thrown.
   * @returns Once read, or failed; the search may still be going on
   */
  async refresh(): Promise<void> {
    this.loading = true;
    try {
      const overview = await this.#options.load();
      this.overview = overview;
      // What a snapshot needs changes with what is installed.
      this.snapshotSpace = null;
      this.failed = false;
      void this.updates.searchFor(overview);
    } catch {
      this.failed = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Install the EMMA module, or update it, then read the installation afresh. A failure, which Foundry tells the user
   * of, leaves the installation as it was.
   * @returns Once installed and read again, or failed
   */
  async installModule(): Promise<void> {
    if (this.installing) return;
    this.installing = true;
    try {
      await this.#options.installModule();
    } catch {
      // Foundry says why itself.
    } finally {
      this.installing = false;
    }
    await this.refresh();
  }

  /**
   * Ask how much space a snapshot needs, and how much is free, once until the installation is read again. A failure is
   * kept in {@link snapshotSpace}, never thrown.
   * @returns Once known, or failed
   */
  async checkSnapshotSpace(): Promise<void> {
    const ask = this.#options.snapshotSpace;
    if (ask === undefined || this.snapshotSpace !== null) return;
    this.snapshotSpace = 'checking';
    try {
      this.snapshotSpace = await ask();
    } catch {
      this.snapshotSpace = 'failed';
    }
  }

  /**
   * Run the update plan: the snapshot and backups checked, then each change, in order (see `lib/run.ts`). It stops at
   * the first step that fails, and before Foundry VTT's own update; the choices cannot change meanwhile. The
   * installation is read afresh after, so what was done leaves the plan and the rest stays in it. A failure is kept in
   * {@link run}, never thrown.
   * @returns Once the run is over, and the installation read again
   */
  async runPlan(): Promise<void> {
    const runStep = this.#options.runStep;
    if (runStep === undefined || this.running) return;
    const { updates } = this;
    const steps = runSteps(updates.safeguards, updates.plan, key => updates.titleOf(key));
    let states: Record<string, StepState> = Object.fromEntries(steps.map(({ key }) => [key, 'waiting']));
    const mark = (key: string, state: StepState): void => {
      states = { ...states, [key]: state };
      this.run = { steps, states, over: false };
    };
    this.run = { steps, states, over: false };
    updates.locked = true;
    let end: Pick<PlanRun, 'failure' | 'beforeCore'> = {};
    try {
      for (const step of steps) {
        if (step.kind === 'core') {
          end = { beforeCore: step.version };
          break;
        }
        mark(step.key, 'running');
        try {
          await runStep(step);
        } catch (error) {
          mark(step.key, 'failed');
          end = { failure: { step, message: error instanceof Error ? error.message : String(error) } };
          break;
        }
        mark(step.key, 'done');
      }
    } finally {
      updates.locked = false;
      this.run = { steps, states, over: true, ...end };
    }
    await this.refresh();
  }

  /**
   * Switch the guard on or off.
   * @param on - Whether EMMA guards Foundry's package buttons
   */
  setGuardOn(on: boolean): void {
    this.guardOn = on;
    this.#options.onGuardChange(on);
  }
}
