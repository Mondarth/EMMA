/**
 * What the setup screen's EMMA window shows: the installation as last read, its updates, and whether EMMA guards
 * Foundry's own package buttons. Reactive, with Svelte 5 runes, so the window follows any change.
 */
import type { PendingPlan } from '../foundry/preferences';
import type { CoreTarget, CoreUpdateState, ListedPackage, SnapshotSpace } from '../foundry/setup-game';
import type { InstallFilters } from '../lib/install';
import { DEFAULT_FILTERS } from '../lib/install';
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
  /** Foundry's updater; none where Foundry VTT cannot be updated from here. */
  readonly core?: CoreUpdater;
  /** Keep the plan to restore after Foundry VTT's update, or forget it with `null`; whether it could. */
  readonly keepPendingPlan?: (plan: PendingPlan | null) => boolean;
  /** The plan kept to restore after Foundry VTT's update, if any. */
  readonly pendingPlan?: () => PendingPlan | undefined;
  /** Keep whether EMMA keeps Foundry VTT at the build installed, which reading the installation then reads; none can be without. */
  readonly lockCore?: (locked: boolean) => void;
  /** Keep whether EMMA ignores a world, a game system or a module, which reading the installation then reads; none can be without. */
  readonly ignore?: (key: string, ignored: boolean) => void;
  /** Lock a game system or module in Foundry, or unlock it, as Foundry's own package menu does; none can be without. */
  readonly lockPackage?: (type: 'module' | 'system', id: string, lock: boolean) => Promise<void>;
  /** Read Foundry's listing of the packages of a type that may be installed; none where it cannot be read. */
  readonly listPackages?: (type: 'module' | 'system') => Promise<readonly ListedPackage[]>;
  /**
   * Where EMMA is in alpha testing: whether the user has acknowledged it for this version, and how to keep that they
   * have. None where EMMA is not an alpha.
   */
  readonly alpha?: { readonly acknowledged: boolean; readonly acknowledge: () => void };
}

/** What is known of Foundry's listing of a type of package: `loading`, `failed`, or the packages; `null` before. */
export type ListingState = readonly ListedPackage[] | 'loading' | 'failed' | null;

/** Foundry's own updater, as its Update Software form drives it (see `foundry/setup-game.ts`). */
export interface CoreUpdater {
  /** Whether Foundry can update itself in place, and its channel. */
  readonly state: () => CoreUpdateState;
  /** Ask which build it would install. */
  readonly check: () => Promise<CoreTarget>;
  /** Start updating to it; Foundry stops or restarts once done. */
  readonly update: () => Promise<void>;
}

/** What is known of updating Foundry VTT in place: `checking`, `failed`, the build its updater would install, or none. */
export type CoreTargetState = CoreTarget | 'checking' | 'failed' | null;

/** Where updating Foundry VTT in place has got: begun, with whether the rest of the plan was kept, or failed. */
export type CoreUpdating =
  | { readonly kind: 'begun'; readonly version: string; readonly kept: boolean }
  | { readonly kind: 'failed'; readonly message: string };

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
  /**
   * Whether the user has acknowledged that this version of EMMA is in alpha testing, which running the plan needs;
   * `true` where EMMA is not an alpha.
   */
  alphaAcknowledged = $state(true);
  /** The installation's updates, searched for each time it is read. */
  readonly updates: UpdateState;
  /** The space a snapshot needs and the space free, once asked, until the installation is read again. */
  snapshotSpace = $state.raw<SnapshotSpaceState>(null);
  /** The last run of the update plan, until the next. */
  run = $state.raw<PlanRun | null>(null);
  /** How many changes the user had made to the plan when the last run ended (see {@link UpdateState.changes}). */
  #ranUntil = $state(0);
  /** The build Foundry's updater would install, once asked, until the installation is read again. */
  coreTarget = $state.raw<CoreTargetState>(null);
  /** Where updating Foundry VTT in place has got, once begun. */
  coreUpdating = $state.raw<CoreUpdating | null>(null);
  /** The version of Foundry VTT the plan was restored on, after it was updated to it. */
  resumedOn = $state<string | null>(null);
  /** Foundry's listings of the game systems and modules that may be installed, once read, for the session. */
  listings = $state.raw<Readonly<Record<'module' | 'system', ListingState>>>({ module: null, system: null });
  /** How the user narrows what each listing offers, for the session. */
  installFilters = $state.raw<Readonly<Record<'module' | 'system', InstallFilters>>>({
    module: DEFAULT_FILTERS,
    system: DEFAULT_FILTERS,
  });

  /**
   * Whether packages can be installed anew here.
   * @returns `true` where Foundry's listing can be read and the plan run
   */
  get canInstall(): boolean {
    return this.#options.listPackages !== undefined && this.#options.runStep !== undefined;
  }

  /**
   * Whether Foundry can update itself in place, and its channel.
   * @returns Whether it can; it cannot where there is no updater
   */
  get coreUpdate(): CoreUpdateState {
    return this.#options.core?.state() ?? { canUpdate: false, channel: 'stable' };
  }

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
    this.alphaAcknowledged = options.alpha?.acknowledged ?? true;
    this.updates = new UpdateState(options.findUpdates);
  }

  /**
   * Whether EMMA is in alpha testing, as the footer warns.
   * @returns `true` for an alpha
   */
  get isAlpha(): boolean {
    return this.#options.alpha !== undefined;
  }

  /** Keep that the user acknowledged this version of EMMA is in alpha testing, so that the plan can be run. */
  acknowledgeAlpha(): void {
    this.#options.alpha?.acknowledge();
    this.alphaAcknowledged = true;
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
      // What a snapshot needs changes with what is installed, as does what Foundry's updater offers.
      this.snapshotSpace = null;
      this.coreTarget = null;
      this.failed = false;
      void this.updates.searchFor(overview).then(() => this.#resume(overview));
    } catch {
      this.failed = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Whether packages can be locked and unlocked here.
   * @returns `true` where they can
   */
  get canLock(): boolean {
    return this.#options.lockPackage !== undefined;
  }

  /**
   * Lock a game system or module in Foundry, or unlock it, then read the installation afresh, so that the plan keeps a
   * package locked as it is, or may change one unlocked. Nothing is done while the plan runs; a failure, which Foundry
   * tells the user of, leaves the package as it was.
   * @param key - The package's key
   * @param lock - Whether to lock it, or unlock it
   * @returns Whether it was done
   */
  async setLocked(key: string, lock: boolean): Promise<boolean> {
    const lockPackage = this.#options.lockPackage;
    if (lockPackage === undefined || this.running || this.updates.locked) return false;
    const type = key.startsWith('system:') ? 'system' : 'module';
    try {
      await lockPackage(type, key.slice(key.indexOf(':') + 1), lock);
    } catch {
      return false;
    }
    await this.refresh();
    return true;
  }

  /**
   * Whether Foundry VTT can be locked here.
   * @returns `true` where it can
   */
  get canLockCore(): boolean {
    return this.#options.lockCore !== undefined;
  }

  /**
   * Lock Foundry VTT at the build installed, or unlock it: EMMA's own lock, as Foundry has none for itself. Locked, the
   * plan never updates Foundry VTT, though it still updates the game systems and modules that run on its build. The
   * installation is read afresh, so that the plan takes the lock. Nothing is done while the plan runs.
   * @param lock - Whether to lock it, or unlock it
   * @returns Whether it was done
   */
  async setCoreLocked(lock: boolean): Promise<boolean> {
    const lockCore = this.#options.lockCore;
    if (lockCore === undefined || this.running || this.updates.locked) return false;
    lockCore(lock);
    await this.refresh();
    return true;
  }

  /**
   * Whether worlds, game systems and modules can be ignored here.
   * @returns `true` where they can
   */
  get canIgnore(): boolean {
    return this.#options.ignore !== undefined;
  }

  /**
   * Have EMMA ignore a world, a game system or a module, or stop ignoring it, then read the installation afresh, so that
   * the plan takes it. Ignored, the plan never takes it into account: a world's setup does not hold anything back, and
   * a package stays as it is installed, taken as whatever what needs it asks. Nothing is done while the plan runs.
   * @param key - Its key, such as `world:alpha`, `system:dnd5e` or `module:dice`
   * @param ignored - Whether to ignore it
   * @returns Whether it was done
   */
  async setIgnored(key: string, ignored: boolean): Promise<boolean> {
    const ignore = this.#options.ignore;
    if (ignore === undefined || this.running || this.updates.locked) return false;
    ignore(key, ignored);
    await this.refresh();
    return true;
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
   * Read Foundry's listing of a type of package that may be installed, once for the session. A failure is kept in
   * {@link listings}, never thrown.
   * @param type - Which
   * @returns Once read, or failed
   */
  async loadListing(type: 'module' | 'system'): Promise<void> {
    const list = this.#options.listPackages;
    if (list === undefined || this.listings[type] !== null) return;
    this.listings = { ...this.listings, [type]: 'loading' };
    let listing: ListingState;
    try {
      listing = await list(type);
    } catch {
      listing = 'failed';
    }
    this.listings = { ...this.listings, [type]: listing };
    if (typeof listing === 'object') this.updates.knowListing(listing);
  }

  /**
   * Change how the user narrows what a listing offers.
   * @param type - Which listing
   * @param change - The filters that change
   */
  setInstallFilters(type: 'module' | 'system', change: Partial<InstallFilters>): void {
    this.installFilters = { ...this.installFilters, [type]: { ...this.installFilters[type], ...change } };
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
    // Running is the one thing that changes the installation, so an alpha's state must be acknowledged first.
    if (runStep === undefined || this.running || !this.alphaAcknowledged) return;
    const { updates } = this;
    const steps = runSteps(updates.safeguards, updates.runPlan, key => updates.titleOf(key));
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
      this.#ranUntil = updates.changes;
    }
    await this.refresh();
  }

  /**
   * The run to show: the last, while it runs, and once it is over until the user changes the plan, as by starting a new
   * one, when what it said is of another plan.
   * @returns The run, or `null`
   */
  get shownRun(): PlanRun | null {
    const { run } = this;
    return run?.over === true && this.updates.changes !== this.#ranUntil ? null : run;
  }

  /**
   * Ask which build Foundry's updater would install, once until the installation is read again. A failure is kept in
   * {@link coreTarget}, never thrown.
   * @returns Once known, or failed
   */
  async checkCoreTarget(): Promise<void> {
    const core = this.#options.core;
    if (core === undefined || this.coreTarget !== null) return;
    this.coreTarget = 'checking';
    try {
      this.coreTarget = await core.check();
    } catch {
      this.coreTarget = 'failed';
    }
  }

  /**
   * Update Foundry VTT in place to the build the plan stopped before, which must be the one its updater would install.
   * The rest of the plan's choices are kept first, to restore once Foundry is on that build. A failure is kept in
   * {@link coreUpdating}, never thrown, and forgets the plan kept.
   * @returns Once the update has begun, or failed
   */
  async updateCoreInPlace(): Promise<void> {
    const core = this.#options.core;
    const version = this.run?.beforeCore;
    const target = this.coreTarget;
    if (core === undefined || version === undefined || typeof target !== 'object' || target === null) return;
    if (!('version' in target) || target.version !== version || target.manual) return;
    const picks = this.updates.picks.filter(([key]) => key !== 'core');
    const kept = this.#options.keepPendingPlan?.({ core: version, picks }) ?? false;
    try {
      await core.update();
      this.coreUpdating = { kind: 'begun', version, kept };
    } catch (error) {
      this.#options.keepPendingPlan?.(null);
      this.coreUpdating = { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Restore the plan kept before Foundry VTT's update, once Foundry is on the build it was updated to, and forget it.
   * @param overview - The installation, as read
   * @returns Once restored
   */
  async #resume(overview: Overview): Promise<void> {
    const pending = this.#options.pendingPlan?.();
    if (pending === undefined || pending.core !== overview.core || this.updates.status !== 'found') return;
    this.#options.keepPendingPlan?.(null);
    for (const [key, version] of pending.picks) await this.updates.choose(key, version);
    this.resumedOn = pending.core;
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
