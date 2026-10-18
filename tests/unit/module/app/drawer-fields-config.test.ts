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

  describe('closing with the choice changed and not saved', () => {
    /**
     * Open the menu and check one more detail, so that the choice differs from the one saved.
     * @returns The menu window and the installed mocks
     */
    async function openChanged() {
      const loaded = await loadMenu();
      const app = new loaded.DrawerFieldsConfig();
      await app.render({ force: true });
      await userEvent.click(screen.getByRole('checkbox', { name: 'MONDARTH-EMMA.Drawer.Field.id' }));
      return { app, ...loaded };
    }

    test('closes without asking when nothing changed', async () => {
      const { DrawerFieldsConfig, foundry } = await loadMenu();
      const app = new DrawerFieldsConfig();
      await app.render({ force: true });

      await app.close();

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });

    test('asks first, keeping the changes by default', async () => {
      const { app, foundry } = await openChanged();

      await app.close();

      expect(foundry.confirm).toHaveBeenCalledOnce();
      expect(foundry.confirm.mock.calls[0]?.[0]).toMatchObject({
        id: 'mondarth-emma-fields-discard',
        window: { title: 'MONDARTH-EMMA.Settings.Fields.Discard.Title' },
        content: '<p>MONDARTH-EMMA.Settings.Fields.Discard.Body</p>',
        modal: true,
        yes: { label: 'MONDARTH-EMMA.Discard.Discard', default: false },
        no: { label: 'MONDARTH-EMMA.Discard.Keep', default: true },
      });
    });

    test.each([false, null])('stays open when the answer is %s', async answer => {
      const { app, foundry } = await openChanged();
      foundry.confirm.mockResolvedValueOnce(answer);

      await expect(app.close()).resolves.toBeUndefined();

      expect(app.rendered).toBe(true);
      expect(screen.getByRole('checkbox', { name: 'MONDARTH-EMMA.Drawer.Field.id' })).toBeChecked();
    });

    test('closes, saving nothing, when the user agrees to discard the changes', async () => {
      const { app, foundry, game } = await openChanged();
      foundry.confirm.mockResolvedValueOnce(true);

      await app.close();

      expect(app.rendered).toBe(false);
      expect(game.settings.set).not.toHaveBeenCalled();
    });

    test('closes without asking when told to discard', async () => {
      const { app, foundry } = await openChanged();

      await app.close({ discard: true });

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });

    test('asks only once while the question is open', async () => {
      const { app, foundry } = await openChanged();
      let answer = (_discard: boolean): void => undefined;
      foundry.confirm.mockReturnValueOnce(
        new Promise(resolve => {
          answer = resolve;
        }),
      );

      const first = app.close();
      await expect(app.close()).resolves.toBeUndefined();
      answer(true);
      await first;

      expect(foundry.confirm).toHaveBeenCalledOnce();
      expect(app.rendered).toBe(false);
    });

    test('does not ask after saving', async () => {
      const { app, foundry } = await openChanged();

      await userEvent.click(screen.getByRole('button', { name: SAVE }));

      await vi.waitFor(() => {
        expect(app.rendered).toBe(false);
      });
      expect(foundry.confirm).not.toHaveBeenCalled();
    });
  });
});
