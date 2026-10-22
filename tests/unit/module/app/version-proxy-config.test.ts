import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { registerSettings } from '@module/settings';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const SAVE = 'MONDARTH-EMMA.Settings.VersionProxy.Save';
const URL_FIELD = 'MONDARTH-EMMA.Settings.VersionProxy.Url';
const KEY_FIELD = 'MONDARTH-EMMA.Settings.VersionProxy.Key';
const PROXY = 'https://proxy.test/?url={url}';
const MODES = 'MONDARTH-EMMA.Settings.VersionProxy.Modes';

/**
 * Install the Foundry mocks with EMMA's settings registered, then load a fresh copy of the menu's module, whose
 * window extends the mocked `ApplicationV2`.
 * @param options - Mock state
 * @param build - The build loaded
 * @param build.withDefault - Whether it has EMMA's own proxy, as a release build does
 * @returns The module and the installed mocks
 */
async function loadMenu(options: FoundryMockOptions = {}, { withDefault = false } = {}) {
  const mocks = installFoundryMocks(options);
  registerSettings();
  vi.resetModules();
  // A release build has EMMA's own proxy; test builds have none.
  vi.doMock('@module/lib/default-proxy', () => ({
    defaultProxy: () => (withDefault ? { url: 'https://default.test/?url={url}', key: 'default-k3y' } : null),
  }));
  return { ...(await import('@module/app/version-proxy-config')), ...mocks };
}

/**
 * Type into a field, replacing what it holds. `userEvent.type` reads braces as keys, so `{url}` is typed as `{{url}`.
 * @param field - The field
 * @param text - The text
 */
async function retype(field: HTMLElement, text: string): Promise<void> {
  await userEvent.clear(field);
  if (text !== '') await userEvent.type(field, text.replaceAll('{', '{{'));
}

describe('registerVersionProxyMenu', () => {
  test('adds a menu that Foundry shows only to those who may change world settings', async () => {
    const { registerVersionProxyMenu, VersionProxyConfig, game } = await loadMenu();

    registerVersionProxyMenu();

    expect(game.settings.registerMenu).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'versionProxyMenu', {
      name: 'MONDARTH-EMMA.Settings.VersionProxy.Name',
      label: 'MONDARTH-EMMA.Settings.VersionProxy.Label',
      hint: 'MONDARTH-EMMA.Settings.VersionProxy.Hint',
      icon: 'fa-solid fa-route',
      type: VersionProxyConfig,
      restricted: true,
    });
  });
});

describe('VersionProxyConfig', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('is titled from the localization file', async () => {
    const { VersionProxyConfig } = await loadMenu();

    expect(new VersionProxyConfig().options.window.title).toBe('MONDARTH-EMMA.Settings.VersionProxy.Title');
  });

  test('shows the proxy and the key set, the key hidden, once across re-renders', async () => {
    const { VersionProxyConfig } = await loadMenu({
      settings: { 'mondarth-emma.versionProxy': PROXY, 'mondarth-emma.versionProxyKey': 'k3y' },
    });
    const app = new VersionProxyConfig();

    await app.render({ force: true });
    await app.render();

    expect(document.querySelectorAll('.emma-proxy')).toHaveLength(1);
    expect(screen.getByLabelText(URL_FIELD)).toHaveValue(PROXY);
    const key = screen.getByLabelText(KEY_FIELD);
    expect(key).toHaveValue('k3y');
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAccessibleDescription('MONDARTH-EMMA.Settings.VersionProxy.KeyHint');
  });

  test('saves the GM’s own proxy and its key and closes', async () => {
    const { VersionProxyConfig, game } = await loadMenu();
    const app = new VersionProxyConfig();
    await app.render({ force: true });

    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.Own` }));
    await retype(screen.getByLabelText(URL_FIELD), PROXY);
    await retype(screen.getByLabelText(KEY_FIELD), 'k3y');
    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    await vi.waitFor(() => {
      expect(app.rendered).toBe(false);
    });
    expect(game.settings.get('mondarth-emma', 'versionProxyMode')).toBe('own');
    expect(game.settings.get('mondarth-emma', 'versionProxy')).toBe(PROXY);
    expect(game.settings.get('mondarth-emma', 'versionProxyKey')).toBe('k3y');
    expect(document.querySelector('.emma-proxy')).toBeNull();
  });

  test('will not save a proxy with nowhere to put the address, saying why', async () => {
    const { VersionProxyConfig, game } = await loadMenu();
    const app = new VersionProxyConfig();
    await app.render({ force: true });
    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.Own` }));
    const url = screen.getByLabelText(URL_FIELD);

    await retype(url, 'https://proxy.test/');

    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('MONDARTH-EMMA.Settings.VersionProxy.Invalid');
    expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
    await userEvent.type(url, '{Enter}');
    expect(game.settings.set).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.None` }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: SAVE })).toBeEnabled();
  });

  test('offers EMMA’s own proxy, chosen until the GM chooses another, in a build that has one', async () => {
    const { VersionProxyConfig } = await loadMenu({}, { withDefault: true });
    await new VersionProxyConfig().render({ force: true });

    expect(screen.getByRole('radio', { name: `${MODES}.Default` })).toBeChecked();
    // Its URL and key are never shown.
    expect(screen.queryByLabelText(URL_FIELD)).toBeNull();
    expect(document.body.textContent).not.toContain('default.test');
  });

  test('chooses no proxy in a build without EMMA’s, until the GM sets their own', async () => {
    const { VersionProxyConfig } = await loadMenu();
    await new VersionProxyConfig().render({ force: true });

    expect(screen.queryByRole('radio', { name: `${MODES}.Default` })).toBeNull();
    expect(screen.getByRole('radio', { name: `${MODES}.None` })).toBeChecked();
  });

  test('asks before choosing no proxy, saying what is lost, and keeps the choice if the GM thinks better of it', async () => {
    const { VersionProxyConfig, foundry, game } = await loadMenu({}, { withDefault: true });
    const app = new VersionProxyConfig();
    await app.render({ force: true });
    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.None` }));

    foundry.confirm.mockResolvedValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: SAVE }));
    await vi.waitFor(() => {
      expect(foundry.confirm).toHaveBeenCalledOnce();
    });
    expect(foundry.confirm.mock.calls[0]?.[0]).toMatchObject({
      window: { title: 'MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Title' },
      content: expect.stringContaining('MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Body') as unknown,
      modal: true,
      yes: { label: 'MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Confirm', default: false },
      no: { label: 'MONDARTH-EMMA.Settings.VersionProxy.NoProxy.Cancel', default: true },
    });
    expect(game.settings.set).not.toHaveBeenCalled();
    expect(app.rendered).toBe(true);

    foundry.confirm.mockResolvedValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: SAVE }));
    await vi.waitFor(() => {
      expect(app.rendered).toBe(false);
    });
    expect(game.settings.get('mondarth-emma', 'versionProxyMode')).toBe('none');
  });

  test('does not ask again when no proxy was chosen already', async () => {
    const { VersionProxyConfig, foundry, game } = await loadMenu(
      { settings: { 'mondarth-emma.versionProxyMode': 'none' } },
      { withDefault: true },
    );
    const app = new VersionProxyConfig();
    await app.render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    await vi.waitFor(() => {
      expect(app.rendered).toBe(false);
    });
    expect(foundry.confirm).not.toHaveBeenCalled();
    expect(game.settings.get('mondarth-emma', 'versionProxyMode')).toBe('none');
  });

  test('stays open and says so when saving fails', async () => {
    const { VersionProxyConfig, game, ui } = await loadMenu();
    const failure = new Error('offline');
    game.settings.set.mockRejectedValueOnce(failure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = new VersionProxyConfig();
    await app.render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    await vi.waitFor(() => {
      expect(ui.notifications.error).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Errors.ProxyFailed');
    });
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to save the version lookup proxy', failure);
    expect(app.rendered).toBe(true);
  });

  test('closing a window that never rendered is harmless', async () => {
    const { VersionProxyConfig } = await loadMenu();
    const app = new VersionProxyConfig();

    await expect(app.close()).resolves.toBe(app);
  });

  describe('closing with a change not saved', () => {
    /**
     * Open the menu and type a key, so that it differs from the one saved.
     * @returns The menu window and the installed mocks
     */
    async function openChanged() {
      const loaded = await loadMenu();
      const app = new loaded.VersionProxyConfig();
      await app.render({ force: true });
      await userEvent.click(screen.getByRole('radio', { name: `${MODES}.Own` }));
      await retype(screen.getByLabelText(KEY_FIELD), 'k3y');
      return { app, ...loaded };
    }

    test('closes without asking when nothing changed', async () => {
      const { VersionProxyConfig, foundry } = await loadMenu();
      const app = new VersionProxyConfig();
      await app.render({ force: true });

      await app.close();

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });

    test('asks first, and stays open unless the user agrees', async () => {
      const { app, foundry, game } = await openChanged();
      foundry.confirm.mockResolvedValueOnce(false);

      await expect(app.close()).resolves.toBeUndefined();

      expect(foundry.confirm.mock.calls[0]?.[0]).toMatchObject({
        id: 'mondarth-emma-proxy-discard',
        window: { title: 'MONDARTH-EMMA.Settings.VersionProxy.Discard.Title' },
        content: '<p>MONDARTH-EMMA.Settings.VersionProxy.Discard.Body</p>',
      });
      expect(app.rendered).toBe(true);

      foundry.confirm.mockResolvedValueOnce(true);
      await app.close();
      expect(app.rendered).toBe(false);
      expect(game.settings.set).not.toHaveBeenCalled();
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

    test('closes without asking when told to discard', async () => {
      const { app, foundry } = await openChanged();

      await app.close({ discard: true });

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });
  });
});
