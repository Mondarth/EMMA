import fs from 'node:fs';
import path from 'node:path';

import { vi } from 'vitest';

/** The extension's English messages, as `chrome.i18n` reads them. */
const MESSAGES = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, '../../public/_locales/en/messages.json'), 'utf8'),
) as Record<string, { message: string }>;

/** A script registered with `chrome.scripting.registerContentScripts`. */
interface Registered {
  id: string;
  matches?: string[];
  js?: string[];
  runAt?: string;
  persistAcrossSessions?: boolean;
}

/** What the browser holds, for a test to set. */
export interface ChromeMockOptions {
  /** What `chrome.storage.local` holds. */
  storage?: Record<string, unknown>;
  /** Whether the user allows the permissions asked for. Defaults to `true`. */
  allow?: boolean;
  /** The tab the user is on. */
  tab?: { id?: number; url?: string };
  /**
   * Whether asking for a permission closes the popup, as Chromium may: the user's answer is never given back to the
   * popup's script, though the permission is still added.
   */
  closesPopup?: boolean;
}

/** A listener for `chrome.runtime.onMessage`. */
type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

/**
 * Install a stand-in for the `chrome` extension API for the current test. Undone after each test, as `unstubGlobals`
 * is set.
 * @param options - What the browser holds
 * @returns The mock, with the scripts registered and the permissions held
 */
export function installChromeMock(options: ChromeMockOptions = {}) {
  const { allow = true, tab = { id: 7, url: 'http://localhost:30000/setup' }, closesPopup = false } = options;
  const storage = new Map<string, unknown>(Object.entries(options.storage ?? {}));
  const session = new Map<string, unknown>();
  const registered = new Map<string, Registered>();
  const origins = new Set<string>();
  const listeners = {
    installed: [] as (() => void)[],
    startup: [] as (() => void)[],
    message: [] as MessageListener[],
    added: [] as ((permissions: { origins?: string[] }) => void)[],
  };

  const chromeMock = {
    runtime: {
      id: 'emma-extension',
      onInstalled: { addListener: vi.fn((fn: () => void) => listeners.installed.push(fn)) },
      onStartup: { addListener: vi.fn((fn: () => void) => listeners.startup.push(fn)) },
      onMessage: { addListener: vi.fn((fn: MessageListener) => listeners.message.push(fn)) },
      // Sent from one of the extension's pages, such as the popup, to the listeners the background script added.
      sendMessage: vi.fn(
        (message: unknown) =>
          new Promise<unknown>(resolve => {
            let waiting = false;
            for (const listener of listeners.message) {
              if (listener(message, { id: 'emma-extension' }, resolve) === true) waiting = true;
            }
            if (!waiting) resolve(undefined);
          }),
      ),
      openOptionsPage: vi.fn(() => Promise.resolve()),
    },
    storage: {
      local: {
        get: vi.fn((key: string) => Promise.resolve(storage.has(key) ? { [key]: storage.get(key) } : {})),
        set: vi.fn((items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, structuredClone(value));
          return Promise.resolve();
        }),
      },
      session: {
        get: vi.fn((key: string) => Promise.resolve(session.has(key) ? { [key]: session.get(key) } : {})),
        set: vi.fn((items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) session.set(key, structuredClone(value));
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          session.delete(key);
          return Promise.resolve();
        }),
      },
    },
    permissions: {
      request: vi.fn(({ origins: asked = [] }: { origins?: string[] }) => {
        const added = allow ? asked.filter(origin => !origins.has(origin)) : [];
        for (const origin of added) origins.add(origin);
        // The browser tells the background later, once the user's answer is in.
        if (added.length > 0) {
          setTimeout(() => {
            for (const listener of listeners.added) listener({ origins: added });
          });
        }
        return closesPopup ? new Promise<boolean>(() => undefined) : Promise.resolve(allow);
      }),
      contains: vi.fn(({ origins: held = [] }: { origins?: string[] }) =>
        Promise.resolve(held.every(origin => origins.has(origin))),
      ),
      onAdded: {
        addListener: vi.fn((fn: (permissions: { origins?: string[] }) => void) => listeners.added.push(fn)),
      },
      remove: vi.fn(({ origins: dropped = [] }: { origins?: string[] }) => {
        for (const origin of dropped) origins.delete(origin);
        return Promise.resolve(true);
      }),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(({ ids = [] }: { ids?: string[] } = {}) =>
        Promise.resolve(ids.flatMap(id => (registered.has(id) ? [registered.get(id)] : []))),
      ),
      registerContentScripts: vi.fn((scripts: Registered[]) => {
        for (const script of scripts) {
          if (registered.has(script.id)) return Promise.reject(new Error(`Duplicate script ID '${script.id}'`));
          registered.set(script.id, script);
        }
        return Promise.resolve();
      }),
      unregisterContentScripts: vi.fn(({ ids = [] }: { ids?: string[] } = {}) => {
        for (const id of ids) registered.delete(id);
        return Promise.resolve();
      }),
      executeScript: vi.fn((_injection: object) => Promise.resolve([])),
    },
    tabs: { query: vi.fn(() => Promise.resolve([tab])) },
    i18n: {
      getMessage: vi.fn((key: string, substitutions: string[] = []) =>
        (MESSAGES[key]?.message ?? '').replace(
          /\$(\d)/g,
          (_match, index: string) => substitutions[Number(index) - 1] ?? '',
        ),
      ),
    },
  };
  vi.stubGlobal('chrome', chromeMock);
  return { chrome: chromeMock, storage, session, registered, origins, listeners };
}
