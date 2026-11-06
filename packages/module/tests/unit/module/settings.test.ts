import { describe, expect, test } from 'vitest';

import {
  getBadgeChecks,
  getDrawerFields,
  getHypotheticallyIgnored,
  getOlderVersions,
  getStartupChanges,
  getView,
  isAutoRecommended,
  isEmmaDisabled,
  isGrouped,
  registerGmSettings,
  registerSettings,
  setDrawerFields,
  setGrouped,
  setHypotheticallyIgnored,
  setView,
  versionLookup,
} from '@module/settings';
import { obscure } from '@mondarth/emma-core/obscure';
import { drawerFields } from '@module/state/drawer-fields.svelte';
import { badgeChecks, setBadgeChecks } from '@module/state/badge-checks.svelte';
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

describe('getStartupChanges', () => {
  test('registers the per-user setting, a dialog by default, in Game Settings for GMs alone', async () => {
    const { game } = installFoundryMocks();

    registerGmSettings();

    expect(game.settings.register).toHaveBeenCalledWith('mondarth-emma', 'startupChanges', {
      name: 'MONDARTH-EMMA.Settings.StartupChanges.Name',
      hint: 'MONDARTH-EMMA.Settings.StartupChanges.Hint',
      scope: 'user',
      config: true,
      type: String,
      choices: {
        none: 'MONDARTH-EMMA.Settings.StartupChanges.None',
        dialog: 'MONDARTH-EMMA.Settings.StartupChanges.Dialog',
        chat: 'MONDARTH-EMMA.Settings.StartupChanges.Chat',
        both: 'MONDARTH-EMMA.Settings.StartupChanges.Both',
      },
      default: 'dialog',
    });
    expect(getStartupChanges()).toBe('dialog');
    await game.settings.set('mondarth-emma', 'startupChanges', 'both');
    expect(getStartupChanges()).toBe('both');
    await game.settings.set('mondarth-emma', 'startupChanges', 'loudly');
    expect(getStartupChanges()).toBe('dialog');
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

describe('getBadgeChecks', () => {
  test('registers the per-user setting in Game Settings for every user, EMMA’s checks by default', () => {
    const { game } = installFoundryMocks({ isGM: false });

    registerSettings();

    expect(game.settings.register).toHaveBeenCalledWith(
      'mondarth-emma',
      'badgeChecks',
      expect.objectContaining({
        name: 'MONDARTH-EMMA.Settings.BadgeChecks.Name',
        hint: 'MONDARTH-EMMA.Settings.BadgeChecks.Hint',
        scope: 'user',
        config: true,
        type: String,
        choices: {
          emma: 'MONDARTH-EMMA.Settings.BadgeChecks.Emma',
          foundry: 'MONDARTH-EMMA.Settings.BadgeChecks.Foundry',
        },
        default: 'emma',
      }),
    );
    expect(getBadgeChecks()).toBe('emma');
  });

  test('follows the setting, taking anything but Foundry’s as EMMA’s, and so does every open window', async () => {
    const { game } = installFoundryMocks();
    registerSettings();
    setBadgeChecks('emma');

    await game.settings.set('mondarth-emma', 'badgeChecks', 'foundry');
    expect(getBadgeChecks()).toBe('foundry');
    expect(badgeChecks.value).toBe('foundry');

    await game.settings.set('mondarth-emma', 'badgeChecks', 'other');
    expect(getBadgeChecks()).toBe('emma');
    expect(badgeChecks.value).toBe('emma');
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

describe('versionLookup', () => {
  /** The catalogue of a release build. */
  const catalogue = { url: obscure('https://catalogue.test/'), key: obscure('catalogue-k3y') };

  test('is EMMA’s catalogue, with its own key, by default', () => {
    installFoundryMocks();
    registerSettings();

    expect(versionLookup(catalogue)).toEqual({
      catalogue: { url: 'https://catalogue.test/', key: 'catalogue-k3y' },
    });
  });

  test('is no catalogue in a build without one', () => {
    installFoundryMocks();
    registerSettings();

    expect(versionLookup(null)).toEqual({ catalogue: null });
  });

  test('is EMMA’s catalogue whatever a world kept of the proxy settings that are gone', () => {
    installFoundryMocks({
      settings: {
        'mondarth-emma.versionProxyMode': 'none',
        'mondarth-emma.versionProxy': 'https://own.test/?url={url}',
      },
    });
    registerSettings();

    expect(versionLookup(catalogue).catalogue).toEqual({ url: 'https://catalogue.test/', key: 'catalogue-k3y' });
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
