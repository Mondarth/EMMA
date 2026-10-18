import { beforeEach, describe, expect, test, vi } from 'vitest';

import { saveModules } from '@module/app/save';
import type { ModuleEntry } from '@module/adapters/modules';
import { ModuleState } from '@module/state/module-state.svelte';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const ENTRIES: ModuleEntry[] = [
  {
    id: 'app',
    title: 'App',
    version: '1.0.0',
    badge: null,
    description: '',
    authors: [],
    languages: [],
    requires: ['lib'],
  },
  {
    id: 'lib',
    title: 'Library',
    version: '1.0.0',
    badge: null,
    description: '',
    authors: [],
    languages: [],
    requires: [],
  },
];

/**
 * Install the mocks with {@link ENTRIES} installed and nothing active, and a state over them.
 * @param options - Further mock state
 * @returns The state and the installed mocks
 */
function setUp(options: FoundryMockOptions = {}) {
  const mocks = installFoundryMocks({ modules: { app: {}, lib: {} }, ...options });
  return { ...mocks, modules: new ModuleState(ENTRIES, {}) };
}

describe('saveModules', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  test('saves the staged activation and asks to reload the world', async () => {
    const { game, foundry, modules } = setUp();
    modules.setActive('lib', true);

    await expect(saveModules(modules)).resolves.toBe(true);

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('core', 'moduleConfiguration', {
      app: false,
      lib: true,
    });
    expect(foundry.reloadConfirm).toHaveBeenCalledExactlyOnceWith({ world: true });
  });

  test('makes the saved activation the new baseline', async () => {
    const { modules } = setUp();
    modules.setActive('lib', true);

    await saveModules(modules);

    expect(modules.dirty).toBe(false);
    expect(modules.isActive('lib')).toBe(true);
  });

  test('neither writes nor asks to reload when nothing changed', async () => {
    const { game, foundry, modules } = setUp({ settings: { 'core.moduleConfiguration': { lib: true } } });
    modules.setActive('lib', true);

    await expect(saveModules(modules)).resolves.toBe(false);

    expect(game.settings.set).not.toHaveBeenCalled();
    expect(foundry.reloadConfirm).not.toHaveBeenCalled();
    expect(modules.dirty).toBe(false);
  });

  test('refuses an activation with unmet requirements, saying which', async () => {
    const { game, ui, modules } = setUp();
    modules.setActive('app', true);

    await expect(saveModules(modules)).resolves.toBe(false);

    expect(game.settings.set).not.toHaveBeenCalled();
    expect(game.i18n.format).toHaveBeenCalledWith('MONDARTH-EMMA.Requirements.Unmet', {
      module: 'App',
      missing: 'Library',
    });
    expect(ui.notifications.error).toHaveBeenCalledOnce();
    expect(modules.dirty).toBe(true);
  });

  test('reports a failed save, keeping the changes staged', async () => {
    const { foundry, ui, modules } = setUp({ isGM: false });
    modules.setActive('lib', true);

    await expect(saveModules(modules)).resolves.toBe(false);

    expect(ui.notifications.error).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Errors.SaveFailed');
    expect(console.error).toHaveBeenCalledWith(
      'mondarth-emma |',
      'Unable to save the module configuration',
      expect.any(Error),
    );
    expect(foundry.reloadConfirm).not.toHaveBeenCalled();
    expect(modules.dirty).toBe(true);
  });
});
