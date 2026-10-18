import type { Mock } from 'vitest';
import { vi } from 'vitest';

type AnyHookFunction = (...args: never[]) => unknown;

interface RegisteredHook {
  id: number;
  name: string;
  fn: AnyHookFunction;
  once: boolean;
}

/**
 * A small working stand-in for Foundry's `Hooks`, typed against the real signatures so drift is caught at compile time.
 * @returns The mock, plus `run` to trigger a hook from a test
 */
export function createHooksMock() {
  let nextId = 1;
  let registered: RegisteredHook[] = [];

  const on = vi.fn((name: Hooks.HookName, fn: AnyHookFunction, options?: Hooks.OnOptions): number => {
    const id = nextId++;
    registered.push({ id, name, fn, once: options?.once ?? false });
    return id;
  });

  const once = vi.fn((name: Hooks.HookName, fn: AnyHookFunction): number => on(name, fn, { once: true }));

  const off = vi.fn((name: Hooks.HookName, target: number | AnyHookFunction): void => {
    registered = registered.filter(hook => hook.name !== name || (hook.id !== target && hook.fn !== target));
  });

  /**
   * Call every callback registered for `name`, removing those registered with `once`.
   * @param name - The hook to trigger
   * @param args - Arguments passed to each callback
   */
  const run = (name: Hooks.HookName, ...args: unknown[]): void => {
    const matching = registered.filter(hook => hook.name === name);
    registered = registered.filter(hook => hook.name !== name || !hook.once);
    for (const hook of matching) (hook.fn as (...hookArgs: unknown[]) => unknown)(...args);
  };

  const callAll = vi.fn((name: Hooks.HookName, ...args: unknown[]): true => {
    run(name, ...args);
    return true;
  });

  return { on, once, off, callAll, run };
}

export interface ModuleMockData {
  active?: boolean;
  /** Defaults to the module ID. */
  title?: string;
  /** Defaults to `1.0.0`. */
  version?: string;
  /** What `getVersionBadge` returns. Defaults to `null`, as for a package Foundry cannot place. */
  badge?: { type: 'success' | 'warning' | 'neutral' | 'error'; tooltip: string; label?: string; icon?: string } | null;
  /** Defaults to empty. */
  description?: string;
  /** Authors: a name, or a name with contact details. */
  authors?: (string | { name: string; url?: string; email?: string; discord?: string })[];
  /** Languages the module is translated into: a language tag, or a tag with a name. */
  languages?: (string | { lang: string; name?: string })[];
  /** Packages it requires: a module ID, or an ID and package type, which defaults to `module` as in Foundry. */
  requires?: (string | { id: string; type?: 'module' | 'system' | 'world' })[];
  api?: unknown;
}

export interface GameMockOptions {
  /** Whether the current user is a GM; `null` leaves `game.user` unset, as it is during `init`. */
  isGM?: boolean | null;
  /** Whether the current user holds the "Modify Configuration Settings" permission. Defaults to `isGM`. */
  canModifySettings?: boolean;
  /** The user's language, `game.i18n.lang`. Defaults to `en`. */
  lang?: string;
  /** Modules known to `game.modules`, keyed by ID. */
  modules?: Record<string, ModuleMockData>;
  /** Initial stored setting values, keyed by `namespace.key`. */
  settings?: Record<string, unknown>;
}

/**
 * Build the `game.modules` entry for a module.
 * @param id - The module ID
 * @param data - What the test sets
 * @returns The mock module
 */
function createModuleMock(id: string, data: ModuleMockData) {
  const {
    active = false,
    title = id,
    version = '1.0.0',
    badge = null,
    description = '',
    authors = [],
    languages = [],
    requires = [],
    api,
  } = data;
  return {
    id,
    active,
    title,
    version,
    getVersionBadge: () => badge,
    description,
    authors: new Set(authors.map(author => (typeof author === 'string' ? { name: author } : author))),
    languages: new Set(
      languages.map(language =>
        typeof language === 'string'
          ? { lang: language, path: `lang/${language}.json` }
          : { path: `lang/${language.lang}.json`, ...language },
      ),
    ),
    relationships: {
      requires: new Set(
        requires.map(required =>
          typeof required === 'string' ? { id: required, type: 'module' } : { type: 'module', ...required },
        ),
      ),
    },
    api,
  };
}

/**
 * Create a stand-in for the parts of `game` that EMMA - Enhanced Module Manager Application uses. Extend it as the module touches more of Foundry.
 * @param options - Initial state
 * @returns The mock `game`
 */
export function createGameMock(options: GameMockOptions = {}) {
  const { isGM = true, lang = 'en', modules = {}, settings = {} } = options;
  const canModifySettings = options.canModifySettings ?? isGM === true;
  const stored = new Map<string, unknown>(Object.entries(settings));
  // Core settings EMMA reads, with Foundry's defaults.
  const defaults = new Map<string, unknown>([['core.moduleConfiguration', {}]]);

  return {
    user:
      isGM === null
        ? null
        : { isGM, can: vi.fn((permission: string): boolean => permission === 'SETTINGS_MODIFY' && canModifySettings) },
    modules: new Map(Object.entries(modules).map(([id, data]) => [id, createModuleMock(id, data)])),
    settings: {
      register: vi.fn((namespace: string, key: string, data: { default?: unknown }): void => {
        defaults.set(`${namespace}.${key}`, data.default);
      }),
      get: vi.fn((namespace: string, key: string): unknown => {
        const id = `${namespace}.${key}`;
        return stored.has(id) ? stored.get(id) : defaults.get(id);
      }),
      set: vi.fn((namespace: string, key: string, value: unknown): Promise<unknown> => {
        stored.set(`${namespace}.${key}`, value);
        return Promise.resolve(value);
      }),
    },
    i18n: {
      lang,
      localize: vi.fn((key: string): string => key),
      format: vi.fn((key: string, data: Record<string, string> = {}): string => `${key} ${JSON.stringify(data)}`),
    },
  };
}

/**
 * A working stand-in for `foundry.applications.api.ApplicationV2`, reproducing the parts of the render and close
 * lifecycle EMMA relies on: `render` builds the frame on first render, then calls `_renderHTML` and `_replaceHTML`;
 * `close` calls `_onClose` and removes the frame.
 */
export class ApplicationV2Mock {
  static DEFAULT_OPTIONS: object = {};

  options: { id?: string; window?: { title?: string } };
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

  protected _renderHTML(_context: object, _options: object): unknown {
    throw new Error('ApplicationV2Mock subclasses must implement _renderHTML');
  }

  protected _replaceHTML(_result: unknown, _content: HTMLElement, _options: object): void {
    throw new Error('ApplicationV2Mock subclasses must implement _replaceHTML');
  }

  protected _onClose(_options: object): void | Promise<void> {
    // The base class does nothing on close.
  }
}

/**
 * Create a stand-in for the `foundry` namespace: `ApplicationV2`, `DialogV2.confirm`, `SettingsConfig.reloadConfirm`,
 * `utils.cleanHTML`, and a native `ModuleManagement` window whose instances are recorded so tests can see when it opened.
 * @returns The mock namespace
 */
export function createFoundryNamespaceMock() {
  const moduleManagementRender = vi.fn(() => Promise.resolve());
  const reloadConfirm = vi.fn((_options?: { world?: boolean }) => Promise.resolve());
  // Resolves as a dismissed dialog does, unless a test says otherwise.
  const confirm = vi.fn((_config?: object): Promise<boolean | null> => Promise.resolve(null));
  // Foundry removes every tag and attribute it does not allow; removing scripts is enough to see it was called.
  const cleanHTML = vi.fn((raw: string): string => raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));

  return {
    applications: {
      api: { ApplicationV2: ApplicationV2Mock, DialogV2: { confirm } },
      settings: { SettingsConfig: { reloadConfirm } },
      sidebar: {
        apps: {
          ModuleManagement: class {
            render = moduleManagementRender;
          },
        },
      },
    },
    utils: { cleanHTML },
    /** Called each time a native Module Management window is rendered. */
    moduleManagementRender,
    /** `SettingsConfig.reloadConfirm`, which asks the user to reload. */
    reloadConfirm,
    /** `DialogV2.confirm`, which asks the user a yes-or-no question. */
    confirm,
    /** `utils.cleanHTML`, which makes HTML safe to insert. */
    cleanHTML,
  };
}

export interface FoundryMockOptions extends GameMockOptions {
  /** Value of `CONFIG.debug.hooks`. */
  debugHooks?: boolean;
}

/**
 * Install mock Foundry globals (`foundry`, `Hooks`, `game`, `ui`, `CONFIG`) for the current test.
 * Undo with `vi.unstubAllGlobals()`.
 * @param options - Initial state
 * @returns Handles to the installed mocks
 */
export function installFoundryMocks(options: FoundryMockOptions = {}) {
  const { debugHooks = false, ...gameOptions } = options;
  const hooks = createHooksMock();
  const game = createGameMock(gameOptions);
  // Typed with Vitest's public `Mock`: inferred, the type names a Vitest-internal file and cannot be emitted.
  const ui: { notifications: Record<'info' | 'warn' | 'error', Mock> } = {
    notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config = { debug: { hooks: debugHooks } };
  const foundry = createFoundryNamespaceMock();

  vi.stubGlobal('foundry', foundry);
  vi.stubGlobal('Hooks', hooks);
  vi.stubGlobal('game', game);
  vi.stubGlobal('ui', ui);
  vi.stubGlobal('CONFIG', config);

  return { foundry, hooks, game, ui, config };
}
