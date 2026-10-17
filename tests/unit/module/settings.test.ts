import { describe, expect, test } from 'vitest';

import { getView, isEmmaDisabled, registerSettings, setView } from '@module/settings';
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
