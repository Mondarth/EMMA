import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { registerSettings } from '@module/settings';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const MODULES = { dice: { title: 'Dice So Nice!' }, emma: { title: 'EMMA' } };

/**
 * Install the Foundry mocks with EMMA's settings registered, then load a fresh copy of the app module: `EmmaApp`
 * extends the mocked `ApplicationV2`, and each copy starts without an open window.
 * @param options - Mock state
 * @returns The app module and the installed mocks
 */
async function loadApp(options: FoundryMockOptions = {}) {
  const mocks = installFoundryMocks({ modules: MODULES, ...options });
  registerSettings();
  vi.resetModules();
  return { ...(await import('@module/app/emma-app')), ...mocks };
}

describe('EmmaApp', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('is titled from the localization file', async () => {
    const { EmmaApp } = await loadApp();

    expect(new EmmaApp().options.window.title).toBe('MONDARTH-EMMA.App.Title');
  });

  test('shows the cube icon of the Settings sidebar’s Manage Modules button', async () => {
    const { EmmaApp } = await loadApp();

    expect(new EmmaApp().options.window.icon).toBe('fa-solid fa-cube');
  });

  test('mounts the Svelte root into the window content when it renders', async () => {
    const { EmmaApp } = await loadApp();
    const app = new EmmaApp();

    await app.render({ force: true });

    expect(app.mounted).toBe(true);
    expect(app.element.querySelector('section .emma-root')).toBeInTheDocument();
  });

  test('keeps the same component across re-renders', async () => {
    const { EmmaApp } = await loadApp();
    const app = new EmmaApp();

    await app.render({ force: true });
    const root = app.element.querySelector('.emma-root');
    await app.render();

    expect(app.element.querySelectorAll('.emma-root')).toHaveLength(1);
    expect(app.element.querySelector('.emma-root')).toBe(root);
  });

  test('unmounts the component when it closes', async () => {
    const { EmmaApp } = await loadApp();
    const app = new EmmaApp();
    await app.render({ force: true });
    const content = app.element.querySelector('section');

    await app.close();

    expect(app.mounted).toBe(false);
    expect(content?.childElementCount).toBe(0);
    expect(document.querySelector('.emma-root')).toBeNull();
  });

  test('closing a window that never rendered is harmless', async () => {
    const { EmmaApp } = await loadApp();
    const app = new EmmaApp();

    await expect(app.close()).resolves.toBe(app);
    expect(app.mounted).toBe(false);
  });

  test('shows the drawer details the user chose', async () => {
    const { EmmaApp } = await loadApp({ settings: { 'mondarth-emma.drawerFields': ['id'] } });
    const { drawerFields } = await import('@module/state/drawer-fields.svelte');

    await new EmmaApp().render({ force: true });

    expect(drawerFields.shown).toEqual(['id']);
  });

  test('activates recommended modules with the modules that recommend them only while the user has chosen to', async () => {
    const { EmmaApp, game } = await loadApp({
      modules: { app: { title: 'App', recommends: ['extra'] }, extra: { title: 'Extra' } },
    });
    await new EmmaApp().render({ force: true });
    const app = screen.getByRole('checkbox', { name: 'App' });

    await userEvent.click(app);
    expect(screen.getByRole('checkbox', { name: /Extra/ })).not.toBeChecked();
    await userEvent.click(app);

    await game.settings.set('mondarth-emma', 'autoRecommended', true);
    await userEvent.click(app);
    expect(screen.getByRole('checkbox', { name: /Extra/ })).toBeChecked();
  });

  test('shows the installed modules with their saved activation', async () => {
    const { EmmaApp } = await loadApp({ settings: { 'core.moduleConfiguration': { dice: true } } });

    await new EmmaApp().render({ force: true });

    expect(screen.getByRole('checkbox', { name: 'Dice So Nice!' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).not.toBeChecked();
  });

  test('opens in the view the user last chose', async () => {
    const { EmmaApp } = await loadApp({ settings: { 'mondarth-emma.view': 'split' } });

    await new EmmaApp().render({ force: true });

    expect(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Split' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('remembers the view the user switches to', async () => {
    const { EmmaApp, game } = await loadApp();
    await new EmmaApp().render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Split' }));

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'view', 'split');
  });

  test('logs, and keeps the new view, if the view cannot be saved', async () => {
    const { EmmaApp, game } = await loadApp();
    const failure = new Error('offline');
    game.settings.set.mockRejectedValueOnce(failure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await new EmmaApp().render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Split' }));

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to remember the view', failure);
    });
    expect(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Split' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('offers GMs hypothetical mode, showing the Foundry and system versions', async () => {
    const { EmmaApp } = await loadApp({ version: '14.370', system: { id: 'pf2e', title: 'PF2e', version: '7.0.1' } });
    await new EmmaApp().render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));

    expect(
      screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.CoreTooltip {"version":"14.370"}' }),
    ).toHaveTextContent('14.370');
    expect(
      screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.SystemTooltip {"title":"PF2e","version":"7.0.1"}' }),
    ).toHaveTextContent('MONDARTH-EMMA.Toolbar.System {"id":"pf2e","version":"7.0.1"}');
  });

  test('looks versions up for GMs through the proxy set, with its API key', async () => {
    const send = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    vi.stubGlobal('fetch', send);
    const { EmmaApp } = await loadApp({
      settings: {
        'mondarth-emma.versionProxy': 'https://proxy.test/?url={url}',
        'mondarth-emma.versionProxyKey': 'k3y',
      },
    });
    await new EmmaApp().render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));

    await vi.waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(send).toHaveBeenCalledWith(
      `https://proxy.test/?url=${encodeURIComponent('https://r2.foundryvtt.com/package-api-public/index-latest.json')}`,
      expect.anything(),
    );
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe('k3y');
  });

  test('does not offer players hypothetical mode', async () => {
    const { EmmaApp } = await loadApp({ isGM: false });
    await new EmmaApp().render({ force: true });

    expect(screen.queryByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' })).toBeNull();
  });

  test('opens with the grouping the user last chose, and remembers a change', async () => {
    const { EmmaApp, game } = await loadApp({ settings: { 'mondarth-emma.grouped': false } });
    await new EmmaApp().render({ force: true });
    const group = screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Group' });
    expect(group).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(group);

    expect(game.settings.set).toHaveBeenCalledExactlyOnceWith('mondarth-emma', 'grouped', true);
  });

  test('logs, and keeps the new grouping, if it cannot be saved', async () => {
    const { EmmaApp, game } = await loadApp();
    const failure = new Error('offline');
    game.settings.set.mockRejectedValueOnce(failure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await new EmmaApp().render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Group' }));

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to remember the grouping', failure);
    });
    expect(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Group' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  describe('closing with staged changes', () => {
    /**
     * Open EMMA and stage a change.
     * @returns The window and the installed mocks
     */
    async function openWithChange() {
      const loaded = await loadApp();
      const app = new loaded.EmmaApp();
      await app.render({ force: true });
      await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
      return { ...loaded, app };
    }

    test('closes without asking when nothing is staged', async () => {
      const { EmmaApp, foundry } = await loadApp();
      const app = new EmmaApp();
      await app.render({ force: true });

      await expect(app.close()).resolves.toBe(app);

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });

    test('asks first, offering to keep editing by default', async () => {
      const { app, foundry } = await openWithChange();

      await app.close();

      expect(foundry.confirm).toHaveBeenCalledOnce();
      expect(foundry.confirm.mock.calls[0]?.[0]).toMatchObject({
        id: 'mondarth-emma-discard',
        window: { title: 'MONDARTH-EMMA.Discard.Title' },
        content: '<p>MONDARTH-EMMA.Discard.Body</p>',
        modal: true,
        yes: { label: 'MONDARTH-EMMA.Discard.Discard', default: false },
        no: { label: 'MONDARTH-EMMA.Discard.Keep', default: true },
      });
    });

    test.each([
      ['chooses to keep editing', false],
      ['dismisses the question', null],
    ])('stays open, keeping the changes, when the user %s', async (_case, answer) => {
      const { app, foundry } = await openWithChange();
      foundry.confirm.mockResolvedValueOnce(answer);

      await expect(app.close()).resolves.toBeUndefined();

      expect(app.rendered).toBe(true);
      expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
    });

    test('closes, discarding the changes, when the user agrees', async () => {
      const { app, foundry } = await openWithChange();
      foundry.confirm.mockResolvedValueOnce(true);

      await expect(app.close()).resolves.toBe(app);
      await app.render({ force: true });

      expect(screen.getByRole('checkbox', { name: 'EMMA' })).not.toBeChecked();
    });

    test('closes without asking when told to discard the changes', async () => {
      const { app, foundry } = await openWithChange();

      await app.close({ discard: true });

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });

    test('asks only once, however often closing is attempted meanwhile', async () => {
      const { app, foundry } = await openWithChange();
      let answer: (value: boolean) => void = () => undefined;
      foundry.confirm.mockReturnValueOnce(
        new Promise(resolve => {
          answer = resolve;
        }),
      );

      const first = app.close();
      await expect(app.close()).resolves.toBeUndefined();
      answer(true);

      await expect(first).resolves.toBe(app);
      expect(foundry.confirm).toHaveBeenCalledOnce();
    });

    test('asks again after the user chose to keep editing', async () => {
      const { app, foundry } = await openWithChange();
      foundry.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await app.close();
      await app.close();

      expect(foundry.confirm).toHaveBeenCalledTimes(2);
      expect(app.rendered).toBe(false);
    });

    test('closes without asking once the changes are saved', async () => {
      const { app, foundry } = await openWithChange();
      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' }));
      await vi.waitFor(() => {
        expect(foundry.reloadConfirm).toHaveBeenCalled();
      });

      await app.close();

      expect(foundry.confirm).not.toHaveBeenCalled();
      expect(app.rendered).toBe(false);
    });
  });

  test('saves the staged changes and asks to reload', async () => {
    const { EmmaApp, game, foundry } = await loadApp();
    await new EmmaApp().render({ force: true });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' }));

    await vi.waitFor(() => {
      expect(foundry.reloadConfirm).toHaveBeenCalledExactlyOnceWith({ world: true });
    });
    expect(game.settings.set).toHaveBeenCalledWith('core', 'moduleConfiguration', { dice: false, emma: true });
  });

  test('is read-only for a user who may not manage modules', async () => {
    const { EmmaApp } = await loadApp({ isGM: false });

    await new EmmaApp().render({ force: true });

    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeDisabled();
    expect(screen.getByText('MONDARTH-EMMA.Footer.ReadOnly')).toBeInTheDocument();
  });

  test('mounts afresh when it reopens', async () => {
    const { EmmaApp } = await loadApp();
    const app = new EmmaApp();
    await app.render({ force: true });
    await app.close();

    await app.render({ force: true });

    expect(app.mounted).toBe(true);
    expect(document.querySelectorAll('.emma-root')).toHaveLength(1);
  });
});

describe('openEmma', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('opens the window', async () => {
    const { openEmma } = await loadApp();

    const app = await openEmma();

    expect(app.rendered).toBe(true);
    expect(document.getElementById('mondarth-emma-app')).toBeInTheDocument();
  });

  test('brings the open window to the front rather than opening another', async () => {
    const { openEmma } = await loadApp();
    const first = await openEmma();

    const second = await openEmma();

    expect(second).toBe(first);
    expect(first.bringToFront).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('#mondarth-emma-app')).toHaveLength(1);
  });

  test('reopens the same window after it was closed', async () => {
    const { openEmma } = await loadApp();
    const first = await openEmma();
    await first.close();

    const second = await openEmma();

    expect(second).toBe(first);
    expect(second.rendered).toBe(true);
    expect(second.bringToFront).not.toHaveBeenCalled();
  });
});
