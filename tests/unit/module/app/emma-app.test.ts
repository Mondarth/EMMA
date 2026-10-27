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

  test('looks versions up for GMs through the proxy set, with its API key and EMMA’s version', async () => {
    const send = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    vi.stubGlobal('fetch', send);
    const { EmmaApp } = await loadApp({
      modules: { ...MODULES, 'mondarth-emma': { title: 'EMMA', version: '0.6.0' } },
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
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).get('X-EMMA-Version')).toBe('0.6.0');
  });

  describe('reports', () => {
    const PLAN = 'MONDARTH-EMMA.Report.Reports.plan';
    const CHECK = 'MONDARTH-EMMA.Report.Reports.check';

    /**
     * Open EMMA in hypothetical mode, once its reports can be opened.
     * @returns The window, and the mocks it was loaded with
     */
    async function inHypothetical() {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
      );
      const loaded = await loadApp();
      const app = new loaded.EmmaApp();
      await app.render({ force: true });
      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: PLAN })).toBeEnabled();
      });
      return { ...loaded, app };
    }

    test('opens each report on the setup chosen in its own window, beside the others', async () => {
      await inHypothetical();

      await userEvent.click(screen.getByRole('button', { name: PLAN }));
      await userEvent.click(screen.getByRole('button', { name: CHECK }));

      expect(await screen.findByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Heading' })).toBeInTheDocument();
      expect(await screen.findByRole('region', { name: 'MONDARTH-EMMA.Report.Check.Heading' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: PLAN })).toHaveAttribute('aria-pressed', 'true');
    });

    test('closes a report when its button is pressed again', async () => {
      await inHypothetical();
      await userEvent.click(screen.getByRole('button', { name: PLAN }));
      await screen.findByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Heading' });

      await userEvent.click(screen.getByRole('button', { name: PLAN }));

      await vi.waitFor(() => {
        expect(document.querySelector('.emma-report')).toBeNull();
      });
      expect(screen.getByRole('button', { name: PLAN })).toHaveAttribute('aria-pressed', 'false');
    });

    test('closes the reports on its hypothetical setup when hypothetical mode is left', async () => {
      await inHypothetical();
      await userEvent.click(screen.getByRole('button', { name: PLAN }));
      await userEvent.click(screen.getByRole('button', { name: CHECK }));
      await screen.findByRole('region', { name: 'MONDARTH-EMMA.Report.Check.Heading' });

      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));

      await vi.waitFor(() => {
        expect(document.querySelector('.emma-report')).toBeNull();
      });
    });

    test('closes the reports on its hypothetical setup when it closes', async () => {
      const { app } = await inHypothetical();
      await userEvent.click(screen.getByRole('button', { name: PLAN }));
      await screen.findByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Heading' });

      await app.close();

      expect(document.querySelector('.emma-report')).toBeNull();
    });

    test('opens a report just below its toolbar when there is no room beside its window', async () => {
      await inHypothetical();
      // The module EMMA loaded, after the mocks.
      const { SetupReportApp } = await import('@module/app/setup-report');
      // EMMA's window fills the width of the screen.
      const frame = screen.getByRole('toolbar').closest('#mondarth-emma-app');
      if (frame === null) throw new Error('EMMA’s window is not open');
      vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, window.innerWidth, 700));
      vi.spyOn(screen.getByRole('toolbar'), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 10, 1024, 30));
      const render = vi.spyOn(SetupReportApp.prototype, 'render');

      await userEvent.click(screen.getByRole('button', { name: PLAN }));

      await vi.waitFor(() => {
        expect(render).toHaveBeenCalled();
      });
      const [opened] = render.mock.contexts as InstanceType<typeof SetupReportApp>[];
      expect((opened?.options as { position?: { top: number } }).position?.top).toBe(48);
    });

    test('opens a report in the middle of the screen when its toolbar cannot be found', async () => {
      await inHypothetical();
      // The module EMMA loaded, after the mocks.
      const { SetupReportApp } = await import('@module/app/setup-report');
      screen.getByRole('toolbar').removeAttribute('role');
      const render = vi.spyOn(SetupReportApp.prototype, 'render');

      await userEvent.click(screen.getByRole('button', { name: PLAN }));

      await vi.waitFor(() => {
        expect(render).toHaveBeenCalled();
      });
      const [opened] = render.mock.contexts as InstanceType<typeof SetupReportApp>[];
      expect((opened?.options as { position?: { left: number } }).position?.left).toBe((window.innerWidth - 560) / 2);
    });

    test('logs a report window that fails to open', async () => {
      const { foundry } = await inHypothetical();
      const failure = new Error('no window');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(foundry.applications.api.ApplicationV2.prototype, 'render').mockRejectedValueOnce(failure);

      await userEvent.click(screen.getByRole('button', { name: PLAN }));

      await vi.waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to show the setup report', failure);
      });
    });

    test('logs report windows that fail to close', async () => {
      const { foundry } = await inHypothetical();
      await userEvent.click(screen.getByRole('button', { name: PLAN }));
      await screen.findByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Heading' });
      const failure = new Error('stuck');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const close = vi.spyOn(foundry.applications.api.ApplicationV2.prototype, 'close');

      close.mockRejectedValueOnce(failure);
      await userEvent.click(screen.getByRole('button', { name: PLAN }));
      close.mockRejectedValueOnce(failure);
      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));

      await vi.waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to close the setup report', failure);
        expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to close the setup reports', failure);
      });
    });
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

    test('in hypothetical mode, closes without asking when nothing was staged before the mode', async () => {
      const { EmmaApp, foundry } = await loadApp();
      const app = new EmmaApp();
      await app.render({ force: true });
      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));

      await expect(app.close()).resolves.toBe(app);

      expect(foundry.confirm).not.toHaveBeenCalled();
    });

    test('in hypothetical mode, asks when changes were staged before the mode', async () => {
      const { app, foundry } = await openWithChange();
      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Toolbar.Hypothetical' }));
      foundry.confirm.mockResolvedValueOnce(true);

      await app.close();

      expect(foundry.confirm).toHaveBeenCalledOnce();
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

  describe('the context menu of each module', () => {
    type Entry = foundry.applications.ux.ContextMenu.Entry<HTMLElement>;

    /**
     * Render EMMA, and give the context menu it attached to its rows, and a row to open it on.
     * @param options - Mock state
     * @returns The menu's container, selector, entries and options, with the mocks and the row
     */
    async function menu(options: FoundryMockOptions = {}) {
      const loaded = await loadApp(options);
      const app = new loaded.EmmaApp();
      await app.render({ force: true });
      const { ContextMenu } = loaded.foundry.applications.ux;
      const [container, selector, entries = [], settings] = ContextMenu.mock.calls[0] ?? [];
      const row = document.createElement('li');
      row.dataset['moduleId'] = 'dice';
      return { ...loaded, app, ContextMenu, container, selector, entries, settings, row };
    }

    /**
     * Whether an entry shows on a row.
     * @param entry - The entry
     * @param row - The row
     * @returns `true` if it shows
     */
    const shows = (entry: Entry | undefined, row: HTMLElement) =>
      typeof entry?.visible === 'function' ? entry.visible(row) : entry?.visible;

    test('opens on any module row, in the window, with Foundry’s menu', async () => {
      const { app, container, selector, settings } = await menu();

      expect(container).toBe(app.element.querySelector('section'));
      expect(selector).toBe('[data-module-id]');
      expect(settings).toMatchObject({ jQuery: false });
    });

    test('offers to have hypothetical mode ignore a module, saving it for the world', async () => {
      const { entries, row, game } = await menu();
      const [ignore, include] = entries;

      expect(ignore?.label).toBe('MONDARTH-EMMA.Ignore.Add');
      expect(shows(ignore, row)).toBe(true);
      expect(shows(include, row)).toBe(false);
      void ignore?.onClick?.(new PointerEvent('click'), row);
      await vi.waitFor(() => {
        expect(game.settings.get('mondarth-emma', 'hypotheticalIgnored')).toEqual(['dice']);
      });
    });

    test('offers to stop ignoring a module once it is ignored', async () => {
      const { entries, row, game } = await menu({ settings: { 'mondarth-emma.hypotheticalIgnored': ['dice'] } });
      const [ignore, include] = entries;

      expect(shows(ignore, row)).toBe(false);
      expect(shows(include, row)).toBe(true);
      expect(include?.label).toBe('MONDARTH-EMMA.Ignore.Remove');
      void include?.onClick?.(new PointerEvent('click'), row);
      await vi.waitFor(() => {
        expect(game.settings.get('mondarth-emma', 'hypotheticalIgnored')).toEqual([]);
      });
    });

    test('says so when the change cannot be saved', async () => {
      const { entries, row, game, ui } = await menu();
      vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('offline'));

      void entries[0]?.onClick?.(new PointerEvent('click'), row);

      await vi.waitFor(() => {
        expect(ui.notifications.error).toHaveBeenCalledWith('MONDARTH-EMMA.Errors.IgnoreFailed');
      });
    });

    test('is not given to a player, who has no hypothetical mode', async () => {
      const { ContextMenu } = await menu({ isGM: false });

      expect(ContextMenu).not.toHaveBeenCalled();
    });
  });
});
