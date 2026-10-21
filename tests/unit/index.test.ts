import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { FoundryMockOptions } from './mocks/foundry';
import { installFoundryMocks } from './mocks/foundry';

/**
 * Install the Foundry mocks and load a fresh copy of the module entry point.
 * @param options - Mock state
 * @returns Handles to the installed mocks
 */
async function loadModule(options: FoundryMockOptions = {}) {
  const mocks = installFoundryMocks(options);
  vi.resetModules();
  await import('../../src/index');
  return mocks;
}

describe('module entry point', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  test('does nothing until Foundry fires init', async () => {
    const { hooks, game } = await loadModule();

    expect(hooks.once).toHaveBeenCalledExactlyOnceWith('init', expect.any(Function));
    expect(console.info).not.toHaveBeenCalled();
    expect(game.settings.register).not.toHaveBeenCalled();
  });

  test('announces itself on init', async () => {
    const { hooks } = await loadModule();

    hooks.run('init');

    expect(console.info).toHaveBeenCalledExactlyOnceWith('mondarth-emma |', 'Initializing');
  });

  test('registers its settings and takes over Module Management on init', async () => {
    const { hooks, game } = await loadModule();

    hooks.run('init');

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'disabled', expect.any(Object));
    expect(game.settings.registerMenu).toHaveBeenCalledWith('mondarth-emma', 'drawerFieldsMenu', expect.any(Object));
    expect(game.settings.registerMenu).toHaveBeenCalledWith('mondarth-emma', 'versionProxyMenu', expect.any(Object));
    expect(hooks.on).toHaveBeenCalledWith('renderSettings', expect.any(Function));
  });

  test('only initializes once', async () => {
    const { hooks } = await loadModule();

    hooks.run('init');
    hooks.run('init');

    expect(console.info).toHaveBeenCalledOnce();
  });
});
