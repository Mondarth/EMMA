import type { Mock } from 'vitest';
import { vi } from 'vitest';

import type { WorldRecord } from '@mondarth/emma-core/world-record';

/**
 * A working stand-in for `foundry.applications.api.ApplicationV2`, reproducing the parts of the render and close
 * lifecycle EMMA relies on: `render` builds the frame on first render, then calls `_renderHTML` and `_replaceHTML`;
 * `close` calls `_onClose` and removes the frame.
 */
export class ApplicationV2Mock {
  static DEFAULT_OPTIONS: object = {};

  options: { id?: string };
  element: HTMLElement | null = null;
  rendered = false;
  bringToFront: Mock<() => void> = vi.fn();

  constructor(options: object = {}) {
    const ctor = this.constructor as typeof ApplicationV2Mock;
    this.options = { ...ctor.DEFAULT_OPTIONS, ...options };
  }

  async render(options: object = {}): Promise<this> {
    if (this.element === null) {
      this.element = document.createElement('div');
      if (this.options.id !== undefined) this.element.id = this.options.id;
      this.element.append(document.createElement('section'));
      document.body.append(this.element);
    }
    const result = await this._renderHTML({}, options);
    this._replaceHTML(result, this.element.firstElementChild as HTMLElement, options);
    this.rendered = true;
    return this;
  }

  async close(options: object = {}): Promise<this> {
    await this._onClose(options);
    this.element?.remove();
    this.element = null;
    this.rendered = false;
    return this;
  }

  protected _renderHTML(_context: object, _options: object): Promise<unknown> {
    return Promise.reject(new Error('ApplicationV2Mock subclasses must implement _renderHTML'));
  }

  protected _replaceHTML(_result: unknown, _content: HTMLElement, _options: object): void {
    throw new Error('ApplicationV2Mock subclasses must implement _replaceHTML');
  }

  protected _onClose(_options: object): void | Promise<void> {
    // The base class does nothing on close.
  }
}

/** Foundry's `Collection`: a map by ID that iterates its values rather than its entries. */
class CollectionMock<V> implements Iterable<V> {
  readonly #map: Map<string, V>;

  constructor(entries: Iterable<readonly [string, V]>) {
    this.#map = new Map(entries);
  }

  set(id: string, value: V): this {
    this.#map.set(id, value);
    return this;
  }

  [Symbol.iterator](): Iterator<V> {
    return this.#map.values();
  }
}

/** A package as one of the setup screen's collections holds it. */
export interface PackageData {
  id: string;
  title?: string | undefined;
  version?: string | undefined;
  /** A module's relationships, as Foundry gives them: sets of the packages related. */
  relationships?: { systems?: unknown; requires?: unknown } | undefined;
  /** The manifest URL it declares. */
  manifest?: string | undefined;
}

/** A world as `game.worlds` holds it. */
export interface WorldData {
  id: string;
  title?: string | undefined;
  system?: string | undefined;
}

/** What the setup screen shows, for a test to set. */
export interface SetupMockOptions {
  /** The Foundry version. Defaults to `14.368`. */
  core?: string;
  /** What `game.release` holds; a stable build of Foundry 14 by default. */
  release?: unknown;
  worlds?: WorldData[];
  modules?: PackageData[];
  systems?: PackageData[];
  /** Records in the worlds' folders, by world ID; a string is written as it is. */
  records?: Record<string, WorldRecord | string>;
}

/**
 * Install mock setup-screen globals (`game`, `ui`, `Hooks`, `foundry`, `fetch`) for the current test. Undone after each
 * test, as `unstubGlobals` is set.
 * @param options - What the setup screen shows
 * @returns Handles to the installed mocks
 */
export function installSetupMocks(options: SetupMockOptions = {}) {
  const { core = '14.368', worlds = [], modules = [], systems = [], records = {} } = options;
  const release = 'release' in options ? options.release : { generation: 14, channel: 'stable' };
  // A package as Foundry has it: its data, and its manifest as plain data from `toObject()`.
  const packaged = (pkg: PackageData) => {
    const data = { title: pkg.id, version: '1.0.0', ...pkg };
    return { ...data, toObject: () => ({ id: data.id, title: data.title, version: data.version }) };
  };
  // The user data folder, by path, as the server serves it.
  const files = new Map<string, string>(
    Object.entries(records).map(([id, record]) => [
      `worlds/${id}/mondarth-emma.json`,
      typeof record === 'string' ? record : JSON.stringify(record),
    ]),
  );
  const post = vi.fn((_request: object, _options?: object): Promise<unknown> => Promise.resolve({ ok: true }));
  const game = {
    view: 'setup',
    version: core,
    release,
    worlds: new CollectionMock<unknown>(
      worlds.map(world => [world.id, { title: world.id, system: 'dnd5e', ...world }]),
    ),
    modules: new CollectionMock<unknown>(modules.map(pkg => [pkg.id, packaged(pkg)])),
    systems: new CollectionMock<unknown>(systems.map(pkg => [pkg.id, packaged(pkg)])),
    post,
  };

  const hooks = new Map<string, ((...args: unknown[]) => void)[]>();
  const Hooks = {
    on: vi.fn((name: string, fn: (...args: unknown[]) => void): number => {
      hooks.set(name, [...(hooks.get(name) ?? []), fn]);
      return hooks.size;
    }),
    /**
     * Call every callback registered for a hook.
     * @param name - The hook
     * @param args - What the callbacks are called with
     */
    run(name: string, ...args: unknown[]): void {
      for (const fn of hooks.get(name) ?? []) fn(...args);
    },
  };

  const browse = vi.fn((_source: string, target: string) =>
    Promise.resolve({ files: [...files.keys()].filter(path => path.slice(0, path.lastIndexOf('/')) === target) }),
  );
  const fetchFile = vi.fn((url: string, _init?: RequestInit): Promise<Response> => {
    const body = files.get(url.replace(/^\//, ''));
    return Promise.resolve(body === undefined ? new Response('', { status: 404 }) : new Response(body));
  });
  const ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };

  vi.stubGlobal('game', game);
  vi.stubGlobal('ui', ui);
  vi.stubGlobal('Hooks', Hooks);
  vi.stubGlobal('fetch', fetchFile);
  vi.stubGlobal('foundry', {
    applications: {
      api: { ApplicationV2: ApplicationV2Mock },
      apps: { FilePicker: { implementation: { browse } } },
    },
    utils: { getRoute: (path: string): string => `/${path}` },
  });

  return { game, ui, Hooks, files, browse, fetch: fetchFile, post };
}
