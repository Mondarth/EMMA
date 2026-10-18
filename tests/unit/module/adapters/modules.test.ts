import { describe, expect, test } from 'vitest';

import {
  canManageModules,
  listInstalledModules,
  readActivation,
  requestReload,
  writeActivation,
} from '@module/adapters/modules';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const MODULES = {
  'lib-wrapper': { title: 'libWrapper', version: '1.13.2', authors: ['ruipin'] },
  dice: { title: 'Dice So Nice!', version: '5.2.4', authors: ['Simone', 'JDW'] },
  emma: { title: 'EMMA', version: '0.1.0' },
};

/**
 * Install the Foundry mocks with {@link MODULES} installed.
 * @param options - Further mock state
 * @returns Handles to the installed mocks
 */
function setUp(options: FoundryMockOptions = {}) {
  return installFoundryMocks({ modules: MODULES, ...options });
}

describe('listInstalledModules', () => {
  test('describes each installed module', () => {
    setUp();

    expect(listInstalledModules()).toContainEqual({
      id: 'dice',
      title: 'Dice So Nice!',
      version: '5.2.4',
      badge: null,
      description: '',
      authors: [{ name: 'Simone' }, { name: 'JDW' }],
      languages: [],
      requires: [],
    });
  });

  test('gives the compatibility badge Foundry shows, with its tooltip as plain text too', () => {
    installFoundryMocks({
      modules: {
        dice: {
          badge: {
            type: 'error',
            icon: 'fa-solid fa-file-slash',
            label: '5.2.4',
            tooltip: 'Requires <strong>lib-wrapper</strong>',
          },
        },
      },
    });

    expect(listInstalledModules()[0]?.badge).toEqual({
      type: 'error',
      icon: 'fa-solid fa-file-slash',
      tooltip: 'Requires <strong>lib-wrapper</strong>',
      text: 'Requires lib-wrapper',
    });
  });

  test('gives a badge without an icon the one Foundry uses for compatible versions', () => {
    installFoundryMocks({ modules: { dice: { badge: { type: 'success', tooltip: 'Verified' } } } });

    expect(listInstalledModules()[0]?.badge?.icon).toBe('fa-solid fa-code-branch');
  });

  test('cleans the description with Foundry, so it is safe to insert', () => {
    const { foundry } = installFoundryMocks({
      modules: { dice: { description: '<p>Dice</p><script>alert(1)</script>' } },
    });

    expect(listInstalledModules()[0]?.description).toBe('<p>Dice</p>');
    expect(foundry.cleanHTML).toHaveBeenCalledWith('<p>Dice</p><script>alert(1)</script>');
  });

  test('keeps the contact details each author gives', () => {
    installFoundryMocks({
      modules: {
        dice: {
          authors: [
            { name: 'Simone', url: 'https://example.com/simone', email: 'simone@example.com', discord: 'simone' },
            'JDW',
          ],
        },
      },
    });

    expect(listInstalledModules()[0]?.authors).toEqual([
      { name: 'Simone', url: 'https://example.com/simone', email: 'simone@example.com', discord: 'simone' },
      { name: 'JDW' },
    ]);
  });

  test.each(['javascript:alert(1)', 'data:text/html,hi', 'not a url'])('drops an author URL like %s', url => {
    installFoundryMocks({ modules: { dice: { authors: [{ name: 'Simone', url }] } } });

    expect(listInstalledModules()[0]?.authors).toEqual([{ name: 'Simone' }]);
  });

  test('keeps an http author URL', () => {
    installFoundryMocks({ modules: { dice: { authors: [{ name: 'Simone', url: 'http://example.com/' }] } } });

    expect(listInstalledModules()[0]?.authors).toEqual([{ name: 'Simone', url: 'http://example.com/' }]);
  });

  test('names each language as the manifest does, or else in the user’s language', () => {
    installFoundryMocks({
      modules: { dice: { languages: [{ lang: 'fr', name: 'Français' }, 'de', { lang: 'pt-BR', name: '' }] } },
    });

    expect(listInstalledModules()[0]?.languages).toEqual([
      { lang: 'fr', name: 'Français' },
      { lang: 'de', name: 'German' },
      { lang: 'pt-BR', name: 'Brazilian Portuguese' },
    ]);
  });

  test('names languages in the user’s language', () => {
    installFoundryMocks({ modules: { dice: { languages: ['en'] } }, lang: 'fr' });

    expect(listInstalledModules()[0]?.languages).toEqual([{ lang: 'en', name: 'anglais' }]);
  });

  test('sorts by title, ignoring case', () => {
    setUp();

    expect(listInstalledModules().map(({ id }) => id)).toEqual(['dice', 'emma', 'lib-wrapper']);
  });

  test('sorts numbers in titles by value', () => {
    installFoundryMocks({ modules: { ten: { title: 'Pack 10' }, two: { title: 'Pack 2' } } });

    expect(listInstalledModules().map(({ id }) => id)).toEqual(['two', 'ten']);
  });

  test('sorts by the rules of the user language', () => {
    const modules = { z: { title: 'z' }, ae: { title: 'ä' } };
    installFoundryMocks({ modules, lang: 'sv' });

    // Swedish sorts ä after z; English sorts it with a.
    expect(listInstalledModules().map(({ id }) => id)).toEqual(['z', 'ae']);
  });

  test('orders modules with the same title by ID', () => {
    installFoundryMocks({ modules: { b: { title: 'Same' }, a: { title: 'Same' } } });

    expect(listInstalledModules().map(({ id }) => id)).toEqual(['a', 'b']);
  });

  test('lists the modules each module requires', () => {
    installFoundryMocks({ modules: { dice: { requires: ['lib-wrapper', { id: 'socketlib', type: 'module' }] } } });

    expect(listInstalledModules()[0]?.requires).toEqual(['lib-wrapper', 'socketlib']);
  });

  test('ignores required systems and worlds, which EMMA cannot activate', () => {
    installFoundryMocks({
      modules: {
        dice: {
          requires: [
            { id: 'dnd5e', type: 'system' },
            { id: 'my-world', type: 'world' },
          ],
        },
      },
    });

    expect(listInstalledModules()[0]?.requires).toEqual([]);
  });

  test('is empty when nothing is installed', () => {
    installFoundryMocks();

    expect(listInstalledModules()).toEqual([]);
  });
});

describe('readActivation', () => {
  test('reads the saved module configuration', () => {
    setUp({ settings: { 'core.moduleConfiguration': { dice: true, emma: false, 'lib-wrapper': true } } });

    expect(readActivation()).toEqual({ dice: true, emma: false, 'lib-wrapper': true });
  });

  test('treats installed modules missing from the setting as inactive', () => {
    setUp({ settings: { 'core.moduleConfiguration': { dice: true } } });

    expect(readActivation()).toEqual({ dice: true, emma: false, 'lib-wrapper': false });
  });

  test('leaves out modules that are no longer installed', () => {
    setUp({ settings: { 'core.moduleConfiguration': { removed: true } } });

    expect(readActivation()).not.toHaveProperty('removed');
  });
});

describe('canManageModules', () => {
  test('allows a GM with permission to modify settings', () => {
    setUp({ isGM: true });

    expect(canManageModules()).toBe(true);
  });

  test('refuses a GM whose permission to modify settings was taken away', () => {
    setUp({ isGM: true, canModifySettings: false });

    expect(canManageModules()).toBe(false);
  });

  test('refuses a player, even one allowed to modify settings', () => {
    setUp({ isGM: false, canModifySettings: true });

    expect(canManageModules()).toBe(false);
  });

  test('refuses everyone before the user is known', () => {
    setUp({ isGM: null });

    expect(canManageModules()).toBe(false);
  });
});

describe('writeActivation', () => {
  test('saves the activation of every installed module', async () => {
    const { game } = setUp({ settings: { 'core.moduleConfiguration': { dice: true } } });

    await expect(writeActivation({ dice: false, emma: true })).resolves.toBe(true);

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('core', 'moduleConfiguration', {
      dice: false,
      emma: true,
      'lib-wrapper': false,
    });
  });

  test('keeps the saved activation of modules it is not told about', async () => {
    const { game } = setUp({ settings: { 'core.moduleConfiguration': { dice: true } } });

    await writeActivation({ emma: true });

    expect(game.settings.set).toHaveBeenCalledWith(
      'core',
      'moduleConfiguration',
      expect.objectContaining({ dice: true, emma: true }),
    );
  });

  test('drops modules that are not installed', async () => {
    const { game } = setUp();

    await writeActivation({ emma: true, removed: true });

    expect(game.settings.set).toHaveBeenCalledWith(
      'core',
      'moduleConfiguration',
      expect.not.objectContaining({ removed: true }),
    );
  });

  test('writes nothing when the activation is unchanged', async () => {
    const { game } = setUp({ settings: { 'core.moduleConfiguration': { dice: true } } });

    await expect(writeActivation({ dice: true, emma: false })).resolves.toBe(false);

    expect(game.settings.set).not.toHaveBeenCalled();
  });

  test('refuses a user who may not manage modules', async () => {
    const { game } = setUp({ isGM: false });

    await expect(writeActivation({ emma: true })).rejects.toThrow('Only a GM');

    expect(game.settings.set).not.toHaveBeenCalled();
  });
});

describe('requestReload', () => {
  test('asks to reload the world, as Foundry’s Module Management does', async () => {
    const { foundry } = setUp();

    await requestReload();

    expect(foundry.reloadConfirm).toHaveBeenCalledExactlyOnceWith({ world: true });
  });
});
