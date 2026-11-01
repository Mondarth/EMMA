/**
 * The setup screen's settings, kept in the browser's local storage for the Foundry server's address, as the setup
 * screen has no settings of its own that EMMA could use.
 */

/** The key the guard's setting is kept under. */
export const GUARD_KEY = 'mondarth-emma.setup.guard';

/**
 * Whether EMMA guards Foundry's own package buttons. On unless switched off; on also when the storage cannot be read.
 * @returns `true` if the guard is on
 */
export function readGuardOn(): boolean {
  try {
    return localStorage.getItem(GUARD_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Keep whether EMMA guards Foundry's own package buttons. Kept for this visit only if the storage cannot be written.
 * @param on - Whether the guard is on
 */
export function writeGuardOn(on: boolean): void {
  try {
    localStorage.setItem(GUARD_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows and blocked site data refuse storage; the setting then lasts until the page is left.
  }
}

/** The key the panels' sizes are kept under. */
export const LAYOUT_KEY = 'mondarth-emma.setup.layout';

/** How the window's panels share it, each as a share from 0 to 1. */
export interface Layout {
  /** The share of the width the tree takes, beside the panel. */
  readonly tree: number;
  /** The share of the height the update plan takes, below the tree and the panel. */
  readonly plan: number;
}

/** The panels' sizes until the user changes them. */
export const DEFAULT_LAYOUT: Layout = { tree: 0.4, plan: 0.35 };

/**
 * The panels' sizes as the user left them; the defaults for any not kept, or if the storage cannot be read.
 * @returns The sizes
 */
export function readLayout(): Layout {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
    const share = (name: keyof Layout): number => {
      const value = typeof kept === 'object' && kept !== null ? (kept as Record<string, unknown>)[name] : undefined;
      return typeof value === 'number' && value > 0 && value < 1 ? value : DEFAULT_LAYOUT[name];
    };
    return { tree: share('tree'), plan: share('plan') };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Keep the panels' sizes. Kept for this visit only if the storage cannot be written.
 * @param layout - The sizes
 */
export function writeLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // As for the guard's setting.
  }
}

/** The key the plan left for after Foundry VTT's update is kept under. */
export const PENDING_PLAN_KEY = 'mondarth-emma.setup.pending-plan';

/** The choices of a plan that stopped to update Foundry VTT in place, to restore once it is on the build updated to. */
export interface PendingPlan {
  /** The Foundry build updated to. */
  readonly core: string;
  /** The versions chosen besides Foundry VTT's, as `[key, version]`, in the order they were chosen. */
  readonly picks: readonly (readonly [string, string])[];
}

/**
 * The plan left for after Foundry VTT's update, if one was kept and can be read.
 * @returns The plan, or `undefined`
 */
export function readPendingPlan(): PendingPlan | undefined {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PENDING_PLAN_KEY) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return undefined;
    const { core, picks } = kept as Record<string, unknown>;
    const pick = (value: unknown): value is [string, string] =>
      Array.isArray(value) && value.length === 2 && value.every(part => typeof part === 'string');
    return typeof core === 'string' && Array.isArray(picks) && picks.every(pick) ? { core, picks } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keep the plan to restore after Foundry VTT's update.
 * @param plan - The plan, or `null` to forget it
 * @returns Whether it was kept, or forgotten; not if the storage cannot be written
 */
export function writePendingPlan(plan: PendingPlan | null): boolean {
  try {
    if (plan === null) localStorage.removeItem(PENDING_PLAN_KEY);
    else localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}
