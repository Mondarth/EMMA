import { describe, expect, test } from 'vitest';

import {
  getDrawerFields,
  getView,
  isAutoRecommended,
  isEmmaDisabled,
  isGrouped,
  registerSettings,
  setDrawerFields,
  setGrouped,
  setView,
} from '@module/settings';
import { drawerFields } from '@module/state/drawer-fields.svelte';
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

describe('isAutoRecommended', () => {
  test('registers the per-user setting in Game Settings, off by default', () => {
    const { game } = installFoundryMocks();

    registerSettings();

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

  test('follows the setting without a reload', async () => {
    const { game } = installFoundryMocks();
    registerSettings();

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
