import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { closeEmmaSetup } from '../../../src/app/emma-setup-app';
import { startEmmaSetup, waitForSetup } from '../../../src/app/start';
import { GUARDED_CLASS } from '../../../src/foundry/guard';
import { GUARD_KEY } from '../../../src/foundry/preferences';
import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';

import type * as SetupKitModule from '../../../src/foundry/setup-kit';
import { installSetupMocks } from '../../mocks/foundry';
import { KIT } from '../../mocks/kit';

// The browser imports the kit from the server, which the tests have none of.
vi.mock('../../../src/foundry/setup-kit', async importOriginal => ({
  ...(await importOriginal<typeof SetupKitModule>()),
  loadKit: vi.fn(() => Promise.resolve(KIT)),
}));

const STARTED = Symbol.for('mondarth-emma.setup');

/**
 * The setup screen's menu, as Foundry renders it.
 * @returns Its element
 */
function showMenu(): HTMLElement {
  const element = document.createElement('nav');
  element.id = 'setup-menu';
  element.innerHTML = '<div data-application-part="buttons"></div>';
  document.body.append(element);
  return element;
}

afterEach(async () => {
  await closeEmmaSetup();
  Reflect.deleteProperty(globalThis, STARTED);
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.body.className = '';
  localStorage.clear();
});

describe('waitForSetup', () => {
  test('waits for Foundry to set the setup screen up', async () => {
    vi.stubGlobal('game', undefined);
    setTimeout(() => installSetupMocks(), 20);

    await expect(waitForSetup({ intervalMs: 5, timeoutMs: 1_000 })).resolves.toMatchObject({ view: 'setup' });
  });

  test('gives up on any other page', async () => {
    vi.stubGlobal('game', { view: 'game' });

    await expect(waitForSetup({ intervalMs: 5, timeoutMs: 20 })).resolves.toBeUndefined();
  });
});

describe('startEmmaSetup', () => {
  test('guards the package buttons and adds its button to the menu, which opens EMMA', async () => {
    const { game, ui } = installSetupMocks();
    const menu = showMenu();

    await expect(startEmmaSetup()).resolves.toBe(true);

    expect(document.body).toHaveClass(GUARDED_CLASS);
    await game.post({ action: 'installPackage' });
    expect(ui.notifications.info).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('EMMA manages packages'));
    menu.querySelector('button')?.click();
    await vi.waitFor(() => {
      expect(document.getElementById('mondarth-emma-setup')).not.toBeNull();
    });
  });

  test('switching the guard in EMMA greys the buttons out or not, and is kept', async () => {
    installSetupMocks({ worlds: [{ id: 'w', title: 'World' }] });
    const menu = showMenu();
    await startEmmaSetup();
    menu.querySelector('button')?.click();

    const box = await screen.findByRole('checkbox', { name: 'Let Foundry install and update packages here' });
    expect(screen.getByRole('treeitem', { name: /Game systems/ })).toBeInTheDocument();
    await userEvent.click(box);

    expect(document.body).not.toHaveClass(GUARDED_CLASS);
    expect(localStorage.getItem(GUARD_KEY)).toBe('off');
  });

  test('keeps the guard switched off, as last left', async () => {
    localStorage.setItem(GUARD_KEY, 'off');
    installSetupMocks();

    await startEmmaSetup();

    expect(document.body).not.toHaveClass(GUARDED_CLASS);
  });

  test('starts once only', async () => {
    installSetupMocks();

    await startEmmaSetup();

    await expect(startEmmaSetup()).resolves.toBe(false);
  });

  test('does nothing on any other page, and may start later', async () => {
    vi.stubGlobal('game', { view: 'game' });

    await expect(startEmmaSetup({ intervalMs: 5, timeoutMs: 10 })).resolves.toBe(false);

    installSetupMocks();
    await expect(startEmmaSetup()).resolves.toBe(true);
  });

  test('finds updates with the kit of the installed EMMA module', async () => {
    installSetupMocks({
      modules: [{ id: 'mondarth-emma', flags: { setupKit: { api: SETUP_KIT_API, path: 'dist/emma-setup-kit.js' } } }],
    });
    const menu = showMenu();
    await startEmmaSetup();

    menu.querySelector('button')?.click();

    expect(await screen.findByText('No updates found')).toBeInTheDocument();
  });

  test('installs the EMMA module from its prompt, through the guard', async () => {
    const { game, post, ui } = installSetupMocks();
    const installPackage = vi.fn(() => game.post({ action: 'installPackage', id: 'mondarth-emma' }));
    Object.assign(game, { installPackage });
    const menu = showMenu();
    await startEmmaSetup();
    menu.querySelector('button')?.click();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Install the EMMA module' }));

    await vi.waitFor(() => {
      expect(installPackage).toHaveBeenCalledOnce();
    });
    expect(post).toHaveBeenCalledOnce();
    expect(ui.notifications.info).not.toHaveBeenCalled();
  });
});
