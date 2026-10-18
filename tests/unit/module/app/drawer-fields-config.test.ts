import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { registerSettings } from '@module/settings';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const SAVE = 'MONDARTH-EMMA.Settings.Fields.Save';

/**
 * Install the Foundry mocks with EMMA's settings registered, then load a fresh copy of the menu's module, whose
 * window extends the mocked `ApplicationV2`.
 * @param options - Mock state
 * @returns The module and the installed mocks
 */
async function loadMenu(options: FoundryMockOptions = {}) {
  const mocks = installFoundryMocks(options);
  registerSettings();
  vi.resetModules();
  return { ...(await import('@module/app/drawer-fields-config')), ...mocks };
}

describe('registerDrawerFieldsMenu', () => {
  test('adds a menu every user may open to Configure Settings', async () => {
    const { registerDrawerFieldsMenu, DrawerFieldsConfig, game } = await loadMenu();

    registerDrawerFieldsMenu();

    expect(game.settings.registerMenu).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'drawerFieldsMenu', {
      name: 'MONDARTH-EMMA.Settings.Fields.Name',
      label: 'MONDARTH-EMMA.Settings.Fields.Label',
      hint: 'MONDARTH-EMMA.Settings.Fields.Hint',
      icon: 'fa-solid fa-list-check',
      type: DrawerFieldsConfig,
      restricted: false,
    });
  });
});

describe('DrawerFieldsConfig', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('is titled from the localization file', async () => {
    const { DrawerFieldsConfig } = await loadMenu();

    expect(new DrawerFieldsConfig().options.window.title).toBe('MONDARTH-EMMA.Settings.Fields.Title');
  });

  test('shows the fields the user chose, once across re-renders', async () => {
    const { DrawerFieldsConfig } = await loadMenu({ settings: { 'mondarth-emma.drawerFields': ['links'] } });
    const app = new DrawerFieldsConfig();

    await app.render({ force: true });
    await app.render();

    expect(document.querySelectorAll('.emma-fields')).toHaveLength(1);
    expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([
      screen.getByRole('checkbox', { name: 'MONDARTH-EMMA.Drawer.Field.links' }),
    ]);
  });

  test('saves the fields chosen and closes', async () => {
    const { DrawerFieldsConfig, game } = await loadMenu();
    const app = new DrawerFieldsConfig();
    await app.render({ force: true });

    await userEvent.click(screen.getByRole('checkbox', { name: 'MONDARTH-EMMA.Drawer.Field.id' }));
    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    await vi.waitFor(() => {
      expect(app.rendered).toBe(false);
    });
    expect(game.settings.get('mondarth-emma', 'drawerFields')).toEqual(['description', 'authors', 'languages', 'id']);
    expect(document.querySelector('.emma-fields')).toBeNull();
  });

  test('stays open and says so when saving fails', async () => {
    const { DrawerFieldsConfig, game, ui } = await loadMenu();
    const failure = new Error('offline');
    game.settings.set.mockRejectedValueOnce(failure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = new DrawerFieldsConfig();
    await app.render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    await vi.waitFor(() => {
      expect(ui.notifications.error).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Errors.FieldsFailed');
    });
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to save the drawer fields', failure);
    expect(app.rendered).toBe(true);
  });

  test('closing a window that never rendered is harmless', async () => {
    const { DrawerFieldsConfig } = await loadMenu();
    const app = new DrawerFieldsConfig();

    await expect(app.close()).resolves.toBe(app);
  });
});
