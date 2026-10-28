import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { LOADER_ID, SITES_KEY } from '../../../src/browser/api';
import Popup from '../../../src/component/Popup.svelte';
import type { Site } from '../../../src/lib/sites';
import { installChromeMock } from '../../mocks/chrome';

const LOCAL = 'http://localhost:30000';

/**
 * Render the popup for a tab.
 * @param url - The tab's address
 * @param sites - The servers remembered
 * @param options - What else the browser holds
 * @returns The mocks, the callbacks and a user to act with
 */
function setUp(url: string | undefined, sites: Site[] = [], options: Parameters<typeof installChromeMock>[0] = {}) {
  const mocks = installChromeMock({ storage: { [SITES_KEY]: sites }, ...options });
  const onManage = vi.fn();
  const onDone = vi.fn();
  render(Popup, { tab: { id: 7, url }, sites, onManage, onDone });
  return { ...mocks, onManage, onDone, user: userEvent.setup() };
}

describe('Popup', () => {
  test('explains where EMMA runs, on a page not on a web server', () => {
    setUp('chrome://extensions');

    expect(screen.getByText(/runs on a Foundry VTT server's setup screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate on this server' })).toBeNull();
  });

  test('asks for consent on a server not activated, saying what it is for', () => {
    setUp(`${LOCAL}/setup`);

    expect(screen.getByText(`Server: ${LOCAL}`)).toBeInTheDocument();
    expect(screen.getByText(/needs your permission to read and change this server's pages/)).toBeInTheDocument();
    expect(screen.getByText('Alpha: for testing only.')).toBeInTheDocument();
  });

  test('activates EMMA on the server and closes, EMMA now open', async () => {
    const { user, onDone, registered } = setUp(`${LOCAL}/setup`);

    await user.click(screen.getByRole('button', { name: 'Activate on this server' }));

    expect(registered.has(LOADER_ID)).toBe(true);
    expect(onDone).toHaveBeenCalledOnce();
  });

  test('says so when activated from a page that is not the setup screen', async () => {
    const { user, onDone } = setUp(`${LOCAL}/game`);
    expect(screen.getByText(/This is not the server's setup screen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open EMMA just this once' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Activate on this server' }));

    expect(screen.getByRole('status')).toHaveTextContent('EMMA is active on this server.');
    expect(onDone).not.toHaveBeenCalled();
  });

  test('says so when permission is not given', async () => {
    const { user } = setUp(`${LOCAL}/setup`, [], { allow: false });

    await user.click(screen.getByRole('button', { name: 'Activate on this server' }));

    expect(screen.getByRole('status')).toHaveTextContent('Permission was not given');
  });

  test('opens EMMA just this once', async () => {
    const { user, onDone, chrome, storage } = setUp(`${LOCAL}/setup`);

    await user.click(screen.getByRole('button', { name: 'Open EMMA just this once' }));

    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
    expect(storage.get(SITES_KEY)).toEqual([]);
    expect(onDone).toHaveBeenCalledOnce();
  });

  test('on a server activated, switches opening by itself, opens EMMA now, and forgets the server', async () => {
    const { user, onDone, storage } = setUp(`${LOCAL}/setup`, [{ origin: LOCAL, auto: true }]);
    const auto = screen.getByRole('checkbox', { name: "Open EMMA by itself on this server's setup screen" });
    expect(auto).toBeChecked();

    await user.click(auto);
    expect(storage.get(SITES_KEY)).toEqual([{ origin: LOCAL, auto: false }]);
    expect(auto).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Open EMMA now' }));
    expect(onDone).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Forget this server' }));
    expect(storage.get(SITES_KEY)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Activate on this server' })).toBeInTheDocument();
  });

  test('opens the servers page', async () => {
    const { user, onManage } = setUp(`${LOCAL}/setup`);

    await user.click(screen.getByRole('button', { name: 'Manage servers' }));

    expect(onManage).toHaveBeenCalledOnce();
  });
});
