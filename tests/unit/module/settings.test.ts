import { describe, expect, test } from 'vitest';

import {
  getDrawerFields,
  getHypotheticallyIgnored,
  getOlderVersions,
  getVersionProxy,
  getVersionProxyKey,
  getVersionProxyMode,
  getView,
  isAutoRecommended,
  isEmmaDisabled,
  isGrouped,
  registerGmSettings,
  registerSettings,
  setDrawerFields,
  setGrouped,
  setHypotheticallyIgnored,
  setVersionProxy,
  setView,
  versionLookup,
} from '@module/settings';
import { obscure } from '@module/lib/obscure';
import { drawerFields } from '@module/state/drawer-fields.svelte';
import { ignoredModules } from '@module/state/hypothetical-ignored.svelte';
import { installFoundryMocks } from '../mocks/foundry';

describe('registerSettings', () => {
  test('registers the world-scoped Disable EMMA setting, off by default', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'disabled', {
      name: 'MONDARTH-EMMA.Settings.Disabled.Name',
      hint: 'MONDARTH-EMMA.Settings.Disabled.Hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
    });
  });

  test('registers the hidden, per-user view setting, defaulting to the list view', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith(
      'mondarth-emma',
      'view',
      expect.objectContaining({ scope: 'user', config: false, type: String, default: 'list' }),
    );
  });

  test('registers the hidden, per-user drawer fields setting, defaulting to description, authors and languages', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith(
      'mondarth-emma',
      'drawerFields',
      expect.objectContaining({
        scope: 'user',
        config: false,
        type: Array,
        default: ['description', 'authors', 'languages'],
      }),
    );
  });
});

describe('getOlderVersions', () => {
  test('registers the per-user setting, a whole number from 0 to 20, none by default, in Game Settings for GMs', () => {
    const { game } = installFoundryMocks();

    registerGmSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'olderVersions', {
      name: 'MONDARTH-EMMA.Settings.OlderVersions.Name',
      hint: 'MONDARTH-EMMA.Settings.OlderVersions.Hint',
      scope: 'user',
      config: true,
      type: Number,
      range: { min: 0, max: 20, step: 1 },
      default: 0,
    });
    expect(getOlderVersions()).toBe(0);
  });

  test('is not offered to players, who have no hypothetical mode', () => {
    const { game } = installFoundryMocks({ isGM: false });

    registerGmSettings();

    expect(game.settings.register).toHaveBeenCalledWith(
      'mondarth-emma',
      'olderVersions',
      expect.objectContaining({ config: false }),
    );
  });

  test('follows the setting, as a whole number within its range', async () => {
    const { game } = installFoundryMocks();
    registerGmSettings();

    for (const [chosen, read] of [
      [2, 2],
      [2.7, 2],
      [-3, 0],
      [99, 20],
      [Number.NaN, 0],
    ] as const) {
      await game.settings.set('mondarth-emma', 'olderVersions', chosen);
      expect(getOlderVersions()).toBe(read);
    }
  });
});

describe('isAutoRecommended', () => {
  test('registers the per-user setting in Game Settings for GMs, off by default', () => {
    const { game } = installFoundryMocks();

    registerGmSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'autoRecommended', {
      name: 'MONDARTH-EMMA.Settings.AutoRecommended.Name',
      hint: 'MONDARTH-EMMA.Settings.AutoRecommended.Hint',
      scope: 'user',
      config: true,
      type: Boolean,
      default: false,
    });
    expect(isAutoRecommended()).toBe(false);
  });

  test('is not offered to players, who cannot change which modules are active', () => {
    const { game } = installFoundryMocks({ isGM: false });

    registerGmSettings();

    expect(game.settings.register).toHaveBeenCalledWith(
      'mondarth-emma',
      'autoRecommended',
      expect.objectContaining({ config: false }),
    );
  });

  test('is not registered on init, before the user is known', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).not.toHaveBeenCalledWith('mondarth-emma', 'autoRecommended', expect.anything());
  });

  test('follows the setting without a reload', async () => {
    const { game } = installFoundryMocks();
    registerGmSettings();

    await game.settings.set('mondarth-emma', 'autoRecommended', true);

    expect(isAutoRecommended()).toBe(true);
  });
});

describe('isEmmaDisabled', () => {
  test('is false by default', () => {
    installFoundryMocks();
    registerSettings();

    expect(isEmmaDisabled()).toBe(false);
  });

  test('follows the setting without a reload', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

    await game.settings.set('mondarth-emma', 'disabled', true);

    expect(isEmmaDisabled()).toBe(true);
  });
});

describe('getView', () => {
  test('is the list view until the user chooses another', () => {
    installFoundryMocks();
    registerSettings();

    expect(getView()).toBe('list');
  });

  test('is the view the user last chose', async () => {
    installFoundryMocks();
    registerSettings();

    await setView('split');

    expect(getView()).toBe('split');
  });

  test('falls back to the list view for a saved value that is not a view', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.view': 'grid' } });
    registerSettings();

    expect(getView()).toBe('list');
  });
});

describe('setView', () => {
  test('saves the view in the per-user setting', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

    await setView('split');

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'view', 'split');
  });
});

describe('getDrawerFields', () => {
  test('is the description, authors and languages until the user chooses otherwise', () => {
    installFoundryMocks();
    registerSettings();

    expect(getDrawerFields()).toEqual(['description', 'authors', 'languages']);
  });

  test('gives the fields saved in drawer order, without anything that is not a field', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.drawerFields': ['id', 'media', 'links', 'id', 7] } });
    registerSettings();

    expect(getDrawerFields()).toEqual(['links', 'id']);
  });

  test('falls back to the defaults for a saved value that is not a list', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.drawerFields': 'links' } });
    registerSettings();

    expect(getDrawerFields()).toEqual(['description', 'authors', 'languages']);
  });
});

describe('setDrawerFields', () => {
  test('saves the fields in drawer order in the per-user setting', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

    await setDrawerFields(['id', 'description', 'id']);

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'drawerFields', ['description', 'id']);
  });

  test('updates the fields open drawers show, as it does for a change made on another device', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

    await setDrawerFields(['packs']);
    expect(drawerFields.shown).toEqual(['packs']);

    await game.settings.set('mondarth-emma', 'drawerFields', 'not a list');
    expect(drawerFields.shown).toEqual(['description', 'authors', 'languages']);
  });
});

describe('isGrouped', () => {
  test('registers the hidden, per-user setting, grouping by default', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'grouped', {
      scope: 'user',
      config: false,
      type: Boolean,
      default: true,
    });
    expect(isGrouped()).toBe(true);
  });

  test('is what the user last chose', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

    await setGrouped(false);

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'grouped', false);
    expect(isGrouped()).toBe(false);
  });
});

describe('getVersionProxy', () => {
  test('registers a world setting, set in the GM-only menu, with no proxy by default', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'versionProxy', {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });
    expect(getVersionProxy()).toBeNull();
  });

  test('is the URL template set, trimmed', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.versionProxy': ' https://proxy.test/?url={url} ' } });
    registerSettings();

    expect(getVersionProxy()).toBe('https://proxy.test/?url={url}');
  });

  test('is none when the template has nowhere to put the URL', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.versionProxy': 'https://proxy.test/' } });
    registerSettings();

    expect(getVersionProxy()).toBeNull();
  });
});

describe('getVersionProxyKey', () => {
  test('registers a client setting, kept in this browser, with no key by default', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    // Not world or user: Foundry sends those to every user who joins.
    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'versionProxyKey', {
      scope: 'client',
      config: false,
      type: String,
      default: '',
    });
    expect(getVersionProxyKey()).toBeNull();
  });

  test('is the key set, trimmed, or none when it is blank', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.versionProxyKey': ' k3y ' } });
    registerSettings();
    expect(getVersionProxyKey()).toBe('k3y');

    installFoundryMocks({ settings: { 'mondarth-emma.versionProxyKey': '  ' } });
    registerSettings();
    expect(getVersionProxyKey()).toBeNull();
  });
});

describe('getVersionProxyMode', () => {
  test('registers a world setting, set in the GM-only menu, not yet chosen', () => {
    const { game } = installFoundryMocks();

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'versionProxyMode', {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });
  });

  test('is EMMA’s proxy until chosen, or the GM’s own where they set one before there was a choice', () => {
    installFoundryMocks();
    registerSettings();
    expect(getVersionProxyMode()).toBe('default');

    installFoundryMocks({ settings: { 'mondarth-emma.versionProxy': 'https://proxy.test/?url={url}' } });
    registerSettings();
    expect(getVersionProxyMode()).toBe('own');
  });

  test('is the choice made', () => {
    for (const mode of ['default', 'own', 'none'] as const) {
      installFoundryMocks({
        settings: {
          'mondarth-emma.versionProxyMode': mode,
          'mondarth-emma.versionProxy': 'https://proxy.test/?url={url}',
        },
      });
      registerSettings();
      expect(getVersionProxyMode()).toBe(mode);
    }
  });
});

describe('versionLookup', () => {
  /** The default proxy and catalogue of a release build. */
  const built = { url: obscure('https://default.test/?url={url}'), key: obscure('default-k3y') };
  const catalogue = { url: obscure('https://catalogue.test/'), key: obscure('catalogue-k3y') };

  test('is EMMA’s proxy with its key, by default', () => {
    installFoundryMocks();
    registerSettings();

    expect(versionLookup(built)).toEqual({
      proxy: 'https://default.test/?url={url}',
      apiKey: 'default-k3y',
      catalogue: null,
    });
  });

  test('is no proxy by default in a build without one', () => {
    installFoundryMocks();
    registerSettings();

    expect(versionLookup(null)).toEqual({ proxy: null, apiKey: null, catalogue: null });
  });

  test('is the GM’s own proxy with their own key, never EMMA’s key', () => {
    installFoundryMocks({
      settings: {
        'mondarth-emma.versionProxyMode': 'own',
        'mondarth-emma.versionProxy': 'https://own.test/?url={url}',
      },
    });
    registerSettings();
    expect(versionLookup(built)).toEqual({ proxy: 'https://own.test/?url={url}', apiKey: null, catalogue: null });

    installFoundryMocks({
      settings: {
        'mondarth-emma.versionProxyMode': 'own',
        'mondarth-emma.versionProxy': 'https://own.test/?url={url}',
        'mondarth-emma.versionProxyKey': 'own-k3y',
      },
    });
    registerSettings();
    expect(versionLookup(built)).toEqual({ proxy: 'https://own.test/?url={url}', apiKey: 'own-k3y', catalogue: null });
  });

  test('is no proxy when the GM chose none, or their own has nowhere to put the URL', () => {
    installFoundryMocks({
      settings: { 'mondarth-emma.versionProxyMode': 'none', 'mondarth-emma.versionProxyKey': 'k' },
    });
    registerSettings();
    expect(versionLookup(built)).toEqual({ proxy: null, apiKey: null, catalogue: null });

    installFoundryMocks({
      settings: { 'mondarth-emma.versionProxyMode': 'own', 'mondarth-emma.versionProxy': 'https://own.test/' },
    });
    registerSettings();
    expect(versionLookup(built)).toEqual({ proxy: null, apiKey: null, catalogue: null });
  });

  test('asks EMMA’s catalogue first, with its own key, by default', () => {
    installFoundryMocks();
    registerSettings();

    expect(versionLookup(built, catalogue)).toEqual({
      proxy: 'https://default.test/?url={url}',
      apiKey: 'default-k3y',
      catalogue: { url: 'https://catalogue.test/', key: 'catalogue-k3y' },
    });
  });

  test('never asks EMMA’s catalogue when the GM chose their own proxy, or none', () => {
    for (const settings of [
      { 'mondarth-emma.versionProxyMode': 'own', 'mondarth-emma.versionProxy': 'https://own.test/?url={url}' },
      { 'mondarth-emma.versionProxyMode': 'none' },
    ]) {
      installFoundryMocks({ settings });
      registerSettings();
      expect(versionLookup(built, catalogue).catalogue).toBeNull();
    }
  });
});

describe('setVersionProxy', () => {
  test('saves the choice, and the GM’s own proxy and its key, trimmed', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

    await setVersionProxy('own', ' https://proxy.test/?url={url} ', ' k3y ');

    expect(game.settings.set).toHaveBeenCalledWith('mondarth-emma', 'versionProxyMode', 'own');
    expect(game.settings.set).toHaveBeenCalledWith('mondarth-emma', 'versionProxy', 'https://proxy.test/?url={url}');
    expect(game.settings.set).toHaveBeenCalledWith('mondarth-emma', 'versionProxyKey', 'k3y');
    expect(getVersionProxyMode()).toBe('own');
    expect(getVersionProxy()).toBe('https://proxy.test/?url={url}');
    expect(getVersionProxyKey()).toBe('k3y');
  });
});

describe('the modules hypothetical mode ignores', () => {
  test('are a hidden world setting, none by default', () => {
    const { game } = installFoundryMocks();
    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith(
      'mondarth-emma',
      'hypotheticalIgnored',
      expect.objectContaining({ scope: 'world', config: false, type: Array, default: [] }),
    );
    expect(getHypotheticallyIgnored()).toEqual([]);
  });

  test('are added and removed one at a time, kept in order', async () => {
    installFoundryMocks();
    registerSettings();

    await setHypotheticallyIgnored('synth', true);
    await setHypotheticallyIgnored('another', true);
    await setHypotheticallyIgnored('synth', true);
    expect(getHypotheticallyIgnored()).toEqual(['another', 'synth']);

    await setHypotheticallyIgnored('synth', false);
    expect(getHypotheticallyIgnored()).toEqual(['another']);
  });

  test('are followed by every open window, wherever they change', async () => {
    installFoundryMocks();
    registerSettings();

    await setHypotheticallyIgnored('synth', true);
    expect([...ignoredModules]).toEqual(['synth']);
    await setHypotheticallyIgnored('synth', false);
    expect([...ignoredModules]).toEqual([]);
  });

  test('leave out anything that is not a module ID', () => {
    installFoundryMocks({ settings: { 'mondarth-emma.hypotheticalIgnored': ['synth', '', 7, null] } });
    registerSettings();
    expect(getHypotheticallyIgnored()).toEqual(['synth']);

    installFoundryMocks({ settings: { 'mondarth-emma.hypotheticalIgnored': 'synth' } });
    registerSettings();
    expect(getHypotheticallyIgnored()).toEqual([]);
  });
});
