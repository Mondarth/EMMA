/**
 * What the setup screen's EMMA window shows: the installation as last read, and whether EMMA guards Foundry's own
 * package buttons. Reactive, with Svelte 5 runes, so the window follows any change.
 */
import type { Overview } from '../lib/overview';

/** How the state reads the installation and keeps the guard's setting. */
export interface SetupStateOptions {
  /** Read the installation and the worlds' records afresh. */
  readonly load: () => Promise<Overview>;
  /** Whether the guard was on when the screen was last left. */
  readonly guardOn: boolean;
  /** Keep the guard's setting, and show it on the screen. */
  readonly onGuardChange: (on: boolean) => void;
}

/** What the window shows. */
export class SetupState {
  /** The installation, once read. */
  overview = $state<Overview | null>(null);
  /** Whether the installation is being read. */
  loading = $state(false);
  /** Whether the last reading failed. */
  failed = $state(false);
  /** Whether EMMA guards Foundry's own Install, Update and Update All buttons. */
  guardOn = $state(true);

  readonly #options: SetupStateOptions;

  /**
   * @param options - How the state reads the installation and keeps the guard's setting
   */
  constructor(options: SetupStateOptions) {
    this.#options = options;
    this.guardOn = options.guardOn;
  }

  /**
   * Read the installation afresh. A failure is kept in {@link failed}, never thrown.
   * @returns Once read, or failed
   */
  async refresh(): Promise<void> {
    this.loading = true;
    try {
      this.overview = await this.#options.load();
      this.failed = false;
    } catch {
      this.failed = true;
    } finally {
      this.loading = false;
    }
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
