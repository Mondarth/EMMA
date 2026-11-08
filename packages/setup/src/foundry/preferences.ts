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

/** The key the versions pinned are kept under. */
export const PINS_KEY = 'mondarth-emma.setup.pins';

/**
 * The versions pinned, by package key, as kept for this server; none when none are, or the storage cannot be read or
 * holds something else.
 * @returns The pins, as `{ key: version }`
 */
export function readPins(): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PINS_KEY) ?? '{}');
    if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return {};
    return Object.fromEntries(
      Object.entries(kept).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

/**
 * Keep the versions pinned, for this server. Kept for this visit only if the storage cannot be written.
 * @param pins - The pins, as `{ key: version }`
 */
export function writePins(pins: Readonly<Record<string, string>>): void {
  try {
    if (Object.keys(pins).length === 0) localStorage.removeItem(PINS_KEY);
    else localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // As for the guard's setting.
  }
}

/** The key whether EMMA keeps Foundry VTT at the build installed is kept under. */
export const CORE_LOCK_KEY = 'mondarth-emma.setup.core-lock';

/**
 * Whether EMMA keeps Foundry VTT at the build installed: EMMA's own lock, as Foundry has none for itself. Off unless
 * switched on; off also when the storage cannot be read.
 * @returns `true` if it is locked
 */
export function readCoreLocked(): boolean {
  try {
    return localStorage.getItem(CORE_LOCK_KEY) === 'locked';
  } catch {
    return false;
  }
}

/**
 * Keep whether EMMA keeps Foundry VTT at the build installed. Kept for this visit only if the storage cannot be written.
 * @param locked - Whether it is locked
 */
export function writeCoreLocked(locked: boolean): void {
  try {
    if (locked) localStorage.setItem(CORE_LOCK_KEY, 'locked');
    else localStorage.removeItem(CORE_LOCK_KEY);
  } catch {
    // As for the guard's setting.
  }
}

/** The key the EMMA version whose alpha state the user last acknowledged is kept under. */
export const ALPHA_ACKNOWLEDGED_KEY = 'mondarth-emma.setup.alpha-acknowledged';

/**
 * Whether the user has acknowledged that a version of EMMA is in alpha testing: each new version asks again. Not if
 * the storage cannot be read.
 * @param version - The version
 * @returns `true` if they acknowledged that version
 */
export function readAlphaAcknowledged(version: string): boolean {
  try {
    return localStorage.getItem(ALPHA_ACKNOWLEDGED_KEY) === version;
  } catch {
    return false;
  }
}

/**
 * Keep that the user acknowledged that a version of EMMA is in alpha testing. Kept for this visit only if the storage
 * cannot be written.
 * @param version - The version
 */
export function writeAlphaAcknowledged(version: string): void {
  try {
    localStorage.setItem(ALPHA_ACKNOWLEDGED_KEY, version);
  } catch {
    // As for the guard's setting.
  }
}

/** The key whether the best versions are limited to what worlds use is kept under. */
export const BEST_IN_USE_KEY = 'mondarth-emma.setup.best-in-use';

/**
 * Whether the best versions are limited to the game systems and modules worlds use: off unless switched on, and off
 * when the storage cannot be read.
 * @returns `true` if they are
 */
export function readBestInUseOnly(): boolean {
  try {
    return localStorage.getItem(BEST_IN_USE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Keep whether the best versions are limited to what worlds use. Kept for this visit only if the storage cannot be
 * written.
 * @param on - Whether they are
 */
export function writeBestInUseOnly(on: boolean): void {
  try {
    if (on) localStorage.setItem(BEST_IN_USE_KEY, 'on');
    else localStorage.removeItem(BEST_IN_USE_KEY);
  } catch {
    // As for the guard's setting.
  }
}

/** The key what EMMA ignores is kept under. */
export const IGNORED_KEY = 'mondarth-emma.setup.ignored';

/**
 * What the user has EMMA ignore, by key: none if the storage cannot be read, or holds something else.
 * @returns The keys, such as `world:alpha`, `system:dnd5e` or `module:dice`
 */
export function readIgnored(): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(IGNORED_KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Have EMMA ignore a world, a game system or a module, or stop ignoring it. Nothing changes if the storage cannot be
 * written.
 * @param key - Its key
 * @param ignored - Whether to ignore it
 */
export function writeIgnored(key: string, ignored: boolean): void {
  const keys = new Set(readIgnored());
  if (ignored) keys.add(key);
  else keys.delete(key);
  try {
    if (keys.size === 0) localStorage.removeItem(IGNORED_KEY);
    else localStorage.setItem(IGNORED_KEY, JSON.stringify([...keys].sort()));
  } catch {
    // As for the guard's setting.
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

/** The key the window's place and size are kept under, in the browser's local storage. */
export const GEOMETRY_KEY = 'mondarth-emma.setup.geometry';

/** Where the window is, and how big, in pixels, as Foundry positions it. */
export interface Geometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the user left the window; none if it was never moved or resized, or the storage cannot be read. Foundry keeps
 * a window on the screen, so a place off a smaller screen is moved onto it.
 * @returns The window's place and size, or `null`
 */
export function readGeometry(): Geometry | null {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(GEOMETRY_KEY) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return null;
    const { left, top, width, height } = kept as Record<string, unknown>;
    const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    if (!finite(left) || !finite(top) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null;
    return { left, top, width, height };
  } catch {
    return null;
  }
}

/**
 * Keep the window's place and size. Kept for this visit only if the storage cannot be written.
 * @param geometry - Where the window is, and how big
 */
export function writeGeometry(geometry: Geometry): void {
  try {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry));
  } catch {
    // As for the guard's setting.
  }
}

/** The key the plan a run has not finished is kept under. */
export const PENDING_PLAN_KEY = 'mondarth-emma.setup.pending-plan';

/**
 * The choices of a plan a run has not finished, kept as it runs, with what it has done taken out: to restore once
 * Foundry VTT is on the build the run stopped before updating to, or else to offer to resume, as after a step failed,
 * or the page closed while it ran.
 */
export interface PendingPlan {
  /** The Foundry build the run stopped before updating to, if it did. */
  readonly core?: string;
  /** The versions chosen that are not done yet, as `[key, version]`, in the order they were chosen. */
  readonly picks: readonly (readonly [string, string])[];
}

/**
 * The plan a run has not finished, if one was kept and can be read.
 * @returns The plan, or `undefined`
 */
export function readPendingPlan(): PendingPlan | undefined {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PENDING_PLAN_KEY) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return undefined;
    const { core, picks } = kept as Record<string, unknown>;
    const pick = (value: unknown): value is [string, string] =>
      Array.isArray(value) && value.length === 2 && value.every(part => typeof part === 'string');
    if (!Array.isArray(picks) || !picks.every(pick)) return undefined;
    if (core === undefined) return { picks };
    return typeof core === 'string' ? { core, picks } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keep the plan a run has not finished.
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

/** The key the premium packages of a type the user owns are kept under, with when they were read. */
export const OWNED_KEY = 'mondarth-emma.setup.owned';

/** How long what the user owns is kept before Foundry is asked again: a package once owned stays owned. */
export const OWNED_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The premium packages of a type the user owns, as last read, if that was within {@link OWNED_FOR_MS}.
 * @param type - Which
 * @param now - The time now, in milliseconds
 * @returns Their keys, or `undefined` if none were kept, or long ago
 */
export function readOwnedKept(type: 'module' | 'system', now: number = Date.now()): Set<string> | undefined {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(`${OWNED_KEY}.${type}`) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return undefined;
    const { at, keys } = kept as Record<string, unknown>;
    if (typeof at !== 'number' || !(now - at < OWNED_FOR_MS && at <= now)) return undefined;
    if (!Array.isArray(keys) || !keys.every(key => typeof key === 'string')) return undefined;
    return new Set(keys);
  } catch {
    return undefined;
  }
}

/**
 * Keep the premium packages of a type the user owns.
 * @param type - Which
 * @param keys - Their keys
 * @param now - The time they were read, in milliseconds
 */
export function writeOwnedKept(type: 'module' | 'system', keys: ReadonlySet<string>, now: number = Date.now()): void {
  try {
    localStorage.setItem(`${OWNED_KEY}.${type}`, JSON.stringify({ at: now, keys: [...keys] }));
  } catch {
    // As for the guard's setting: Foundry is asked again next visit.
  }
}
