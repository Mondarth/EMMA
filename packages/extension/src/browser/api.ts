/**
 * The only place the extension uses the browser's extension API, through the `chrome` namespace, which Chromium and
 * Firefox (version 128 and later, with Manifest V3) both provide, with promises.
 */
import type { Site, Target } from '../lib/sites';
import { autoPatterns, parseSites } from '../lib/sites';

/** The key the remembered servers are stored under. */
export const SITES_KEY = 'sites';

/** The ID of EMMA's loader, registered for the servers EMMA opens on by itself. */
export const LOADER_ID = 'mondarth-emma-loader';

/**
 * The script that brings EMMA to the setup screen, from `@mondarth/emma-setup`. Like {@link LOADER_SCRIPT}, it is named
 * from the extension's root: Firefox resolves a relative path from the page that asks, such as the popup's.
 */
export const SETUP_SCRIPT = '/emma-setup.js';

/** EMMA's loader (`src/loader.ts`), named from the extension's root. */
export const LOADER_SCRIPT = '/loader.js';

/** The message the loader sends when a page it runs on may be a setup screen. */
export const SETUP_PAGE_MESSAGE = 'mondarth-emma/setup-page';

/** The message the popup sends once the user has allowed EMMA on a server, for the background to finish activating. */
export const ACTIVATE_MESSAGE = 'mondarth-emma/activate';

/** The key an activation waiting on the user's permission is kept under, in the browser's session storage. */
export const PENDING_KEY = 'pendingActivation';

/**
 * An activation waiting on the user's permission. It is kept where the background can find it, as Chromium may close
 * the popup when it asks, ending the popup's script before the user answers.
 */
export interface Pending {
  /** The server's origin. */
  readonly server: string;
  /** The tab the user activated it from. */
  readonly tabId?: number | undefined;
  /** That tab's address. */
  readonly url?: string | undefined;
}

/**
 * Keep an activation waiting on the user's permission, replacing any kept before.
 * @param pending - The activation
 */
export async function keepPending(pending: Pending): Promise<void> {
  await chrome.storage.session.set({ [PENDING_KEY]: pending });
}

/**
 * Take the activation waiting on the user's permission, if any, so that it is finished only once.
 * @returns The activation, or `undefined` if none is kept or what is kept is not one
 */
export async function takePending(): Promise<Pending | undefined> {
  const stored = await chrome.storage.session.get(PENDING_KEY);
  await chrome.storage.session.remove(PENDING_KEY);
  const value: unknown = stored[PENDING_KEY];
  if (typeof value !== 'object' || value === null) return undefined;
  const { server, tabId, url } = value as Record<string, unknown>;
  if (typeof server !== 'string') return undefined;
  return {
    server,
    tabId: typeof tabId === 'number' ? tabId : undefined,
    url: typeof url === 'string' ? url : undefined,
  };
}

/**
 * Whether the extension holds permission to run on pages.
 * @param patterns - The permission patterns
 * @returns `true` if it holds every one
 */
export function holdsPermission(patterns: readonly string[]): Promise<boolean> {
  return chrome.permissions.contains({ origins: [...patterns] });
}

/**
 * Read the servers remembered.
 * @returns The servers
 */
export async function readSites(): Promise<Site[]> {
  const stored = await chrome.storage.local.get(SITES_KEY);
  return parseSites(stored[SITES_KEY]);
}

/**
 * Remember the servers.
 * @param sites - The servers
 */
export async function writeSites(sites: readonly Site[]): Promise<void> {
  await chrome.storage.local.set({ [SITES_KEY]: sites });
}

/**
 * Ask the user for permission to run on pages. Must be called while handling the user's click, before anything else
 * waits, or the browser refuses to ask.
 * @param patterns - The permission patterns
 * @returns `true` if the user allowed it
 */
export function requestPermission(patterns: readonly string[]): Promise<boolean> {
  return chrome.permissions.request({ origins: [...patterns] });
}

/**
 * Give up permission to run on pages.
 * @param patterns - The permission patterns
 */
export async function removePermission(patterns: readonly string[]): Promise<void> {
  await chrome.permissions.remove({ origins: [...patterns] });
}

/**
 * Register EMMA's loader for the servers it opens on by itself, replacing any registered before. The loader runs on
 * every page of those servers and asks the background to bring EMMA in only on a setup screen.
 * @param sites - The servers remembered
 * @param target - The browser
 */
export async function syncLoader(sites: readonly Site[], target: Target): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [LOADER_ID] });
  if (registered.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [LOADER_ID] });
  const matches = autoPatterns(sites, target);
  if (matches.length === 0) return;
  await chrome.scripting.registerContentScripts([
    { id: LOADER_ID, matches, js: [LOADER_SCRIPT], runAt: 'document_idle', persistAcrossSessions: true },
  ]);
}

/**
 * Bring EMMA into a tab, running its script in the page itself, where Foundry's code runs.
 * @param tabId - The tab
 */
export async function injectSetup(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [SETUP_SCRIPT], world: 'MAIN' });
}

/**
 * Ask the background script to finish an activation the user has allowed, and wait until it has.
 * @returns Once finished
 */
export async function askToFinishActivation(): Promise<void> {
  await chrome.runtime.sendMessage({ type: ACTIVATE_MESSAGE });
}
