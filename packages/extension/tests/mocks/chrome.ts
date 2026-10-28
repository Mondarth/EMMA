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
}

/**
 * Install a stand-in for the `chrome` extension API for the current test. Undone after each test, as `unstubGlobals`
 * is set.
 * @param options - What the browser holds
 * @returns The mock, with the scripts registered and the permissions held
 */
export function installChromeMock(options: ChromeMockOptions = {}) {
  const { allow = true, tab = { id: 7, url: 'http://localhost:30000/setup' } } = options;
  const storage = new Map<string, unknown>(Object.entries(options.storage ?? {}));
  const registered = new Map<string, Registered>();
  const origins = new Set<string>();
  const listeners = { installed: [] as (() => void)[], startup: [] as (() => void)[], message: [] as unknown[] };

  const chromeMock = {
    runtime: {
      id: 'emma-extension',
      onInstalled: { addListener: vi.fn((fn: () => void) => listeners.installed.push(fn)) },
      onStartup: { addListener: vi.fn((fn: () => void) => listeners.startup.push(fn)) },
      onMessage: { addListener: vi.fn((fn: unknown) => listeners.message.push(fn)) },
      sendMessage: vi.fn(() => Promise.resolve()),
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
    },
    permissions: {
      request: vi.fn(({ origins: asked = [] }: { origins?: string[] }) => {
        if (allow) for (const origin of asked) origins.add(origin);
        return Promise.resolve(allow);
      }),
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
  return { chrome: chromeMock, storage, registered, origins, listeners };
}
