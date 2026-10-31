/**
 * What the setup screen's EMMA window shows: the installation as last read, its updates, and whether EMMA guards
 * Foundry's own package buttons. Reactive, with Svelte 5 runes, so the window follows any change.
 */
import type { Overview } from '../lib/overview';
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
}

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
   * Switch the guard on or off.
   * @param on - Whether EMMA guards Foundry's package buttons
   */
  setGuardOn(on: boolean): void {
    this.guardOn = on;
    this.#options.onGuardChange(on);
  }
}
