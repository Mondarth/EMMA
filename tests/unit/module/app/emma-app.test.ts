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

  test('discards unsaved changes when it closes', async () => {
    const { EmmaApp } = await loadApp();
    const app = new EmmaApp();
    await app.render({ force: true });
    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));

    await app.close();
    await app.render({ force: true });

    expect(screen.getByRole('checkbox', { name: 'EMMA' })).not.toBeChecked();
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
