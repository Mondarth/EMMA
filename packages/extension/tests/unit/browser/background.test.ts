import { describe, expect, test, vi } from 'vitest';

import { CATALOGUE_REQUEST_MESSAGE, OPEN_SIGN_IN_MESSAGE } from '@mondarth/emma-core/catalogue-relay';

import {
  ACTIVATE_MESSAGE,
  LOADER_ID,
  PENDING_KEY,
  RELAY_TABS_KEY,
  SETUP_PAGE_MESSAGE,
  SITES_KEY,
} from '../../../src/browser/api';
import { TOKEN_KEY } from '../../../src/browser/catalogue';
import { installChromeMock } from '../../mocks/chrome';

const SITES = { [SITES_KEY]: [{ origin: 'http://localhost:30000', auto: true }] };

/**
 * Load the background script afresh, with the browser holding what a test says.
 * @param options - What the browser holds
 * @returns The mock and the script's exports
 */
async function load(options: Parameters<typeof installChromeMock>[0] = {}) {
  const mocks = installChromeMock(options);
  vi.resetModules();
  const background = await import('../../../src/background');
  return { ...mocks, ...background };
}

/**
 * A message sender: the top frame of a tab of the extension's own loader.
 * @param url - The page's address
 * @param change - What differs
 * @returns The sender
 */
function sender(url: string, change: Partial<chrome.runtime.MessageSender> = {}): chrome.runtime.MessageSender {
  return { id: 'emma-extension', frameId: 0, tab: { id: 7 } as chrome.tabs.Tab, url, ...change };
}

describe('the background script', () => {
  test('registers the loader again when the extension is installed or updated, and when the browser starts', async () => {
    const { listeners, registered } = await load({ storage: SITES });

    listeners.installed[0]?.();
    await vi.waitFor(() => {
      expect(registered.get(LOADER_ID)?.matches).toEqual(['http://localhost:30000/*']);
    });
    registered.clear();

    listeners.startup[0]?.();
    await vi.waitFor(() => {
      expect(registered.has(LOADER_ID)).toBe(true);
    });
  });

  test('opens EMMA on a setup screen the loader reports, of a server it opens on by itself', async () => {
    const { chrome, listeners, onSetupPage } = await load({ storage: SITES });

    await expect(onSetupPage({ type: SETUP_PAGE_MESSAGE }, sender('http://localhost:30000/setup'))).resolves.toBe(true);
    (listeners.message[0] as (message: unknown, from: chrome.runtime.MessageSender) => void)(
      { type: SETUP_PAGE_MESSAGE },
      sender('http://localhost:30000/setup'),
    );

    await vi.waitFor(() => {
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
    });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['/emma-setup.js'],
      world: 'MAIN',
    });
  });

  test.each([
    ['another server', { type: SETUP_PAGE_MESSAGE }, sender('http://localhost:30001/setup')],
    ['a page that is not a setup screen', { type: SETUP_PAGE_MESSAGE }, sender('http://localhost:30000/game')],
    ['another message', { type: 'other' }, sender('http://localhost:30000/setup')],
    ['no message', null, sender('http://localhost:30000/setup')],
    ['another extension', { type: SETUP_PAGE_MESSAGE }, sender('http://localhost:30000/setup', { id: 'other' })],
    ['a frame', { type: SETUP_PAGE_MESSAGE }, sender('http://localhost:30000/setup', { frameId: 3 })],
    ['no tab', { type: SETUP_PAGE_MESSAGE }, { id: 'emma-extension', frameId: 0, url: 'http://localhost:30000/setup' }],
  ])('ignores %s', async (_label, message, from) => {
    const { chrome, onSetupPage } = await load({ storage: SITES });

    await expect(onSetupPage(message, from)).resolves.toBe(false);

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  test("answers the popup's message once it has finished the activation, or failed to", async () => {
    const { chrome, session, origins } = await load();
    origins.add('http://localhost:30000/*');
    session.set(PENDING_KEY, { server: 'http://localhost:30000' });
    chrome.storage.local.set.mockRejectedValueOnce(new Error('quota'));

    await expect(chrome.runtime.sendMessage({ type: ACTIVATE_MESSAGE })).resolves.toBe(false);

    session.set(PENDING_KEY, { server: 'http://localhost:30000' });
    await expect(chrome.runtime.sendMessage({ type: ACTIVATE_MESSAGE })).resolves.toBe(true);
  });

  test.each([
    ['a message from a tab', { type: ACTIVATE_MESSAGE }, sender('http://localhost:30000/setup')],
    ['another extension', { type: ACTIVATE_MESSAGE }, { id: 'other' }],
    ['another message', { type: SETUP_PAGE_MESSAGE }, { id: 'emma-extension' }],
    ['no message', null, { id: 'emma-extension' }],
  ])('does not take %s as the popup saying an activation was allowed', async (_label, message, from) => {
    const { isActivateMessage } = await load();

    expect(isActivateMessage(message, from)).toBe(false);
  });
});

describe("the background script's catalogue", () => {
  const CATALOGUE = 'https://catalogue.example.test/';
  const REQUEST = { url: `${CATALOGUE}api/v2/me`, method: 'GET', headers: {} };
  const relayed = { [RELAY_TABS_KEY]: { '7': 'http://localhost:30000' } };

  test('asks the catalogue for a setup screen EMMA was brought into, as the user', async () => {
    const { session, onCatalogueRequest } = await load({ storage: { [TOKEN_KEY]: 't0k3n' } });
    session.set(RELAY_TABS_KEY, relayed[RELAY_TABS_KEY]);
    const send = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })));

    expect(
      await onCatalogueRequest(
        { type: CATALOGUE_REQUEST_MESSAGE, request: REQUEST },
        sender('http://localhost:30000/setup'),
        CATALOGUE,
        send,
      ),
    ).toMatchObject({ status: 200 });
    expect(send).toHaveBeenCalledWith(`${CATALOGUE}api/v2/me`, expect.objectContaining({ credentials: 'omit' }));
  });

  test('asks nothing for a tab EMMA was not brought into, nor in a build without a catalogue', async () => {
    const { session, onCatalogueRequest } = await load({ storage: { [TOKEN_KEY]: 't0k3n' } });
    const send = vi.fn<typeof fetch>();
    const message = { type: CATALOGUE_REQUEST_MESSAGE, request: REQUEST };

    expect(await onCatalogueRequest(message, sender('http://localhost:30000/setup'), CATALOGUE, send)).toBeUndefined();
    session.set(RELAY_TABS_KEY, relayed[RELAY_TABS_KEY]);
    expect(await onCatalogueRequest(message, sender('http://localhost:30000/setup'))).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  test("answers the bridge's request through the browser's messaging, and opens the sign-in on the user's click", async () => {
    const { chrome, session, listeners } = await load();
    session.set(RELAY_TABS_KEY, relayed[RELAY_TABS_KEY]);
    const listener = listeners.message[0] as (
      message: unknown,
      from: chrome.runtime.MessageSender,
      respond: (answer: unknown) => void,
    ) => boolean;
    const respond = vi.fn();

    // A build without a catalogue answers nothing, so the bridge says the catalogue could not be reached.
    expect(
      listener({ type: CATALOGUE_REQUEST_MESSAGE, request: REQUEST }, sender('http://localhost:30000/setup'), respond),
    ).toBe(true);
    await vi.waitFor(() => {
      expect(respond).toHaveBeenCalledWith(undefined);
    });

    expect(listener({ type: OPEN_SIGN_IN_MESSAGE }, sender('http://localhost:30000/setup'), respond)).toBe(false);
    await vi.waitFor(() => {
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
    });
  });

  test('ignores a message that is not one, and a sign-in the browser fails to open', async () => {
    const { chrome, session, listeners } = await load();
    session.set(RELAY_TABS_KEY, relayed[RELAY_TABS_KEY]);
    chrome.runtime.openOptionsPage.mockRejectedValueOnce(new Error('closed'));
    const listener = listeners.message[0] as (
      message: unknown,
      from: chrome.runtime.MessageSender,
      respond: (answer: unknown) => void,
    ) => boolean;

    expect(listener(null, sender('http://localhost:30000/setup'), vi.fn())).toBe(false);
    expect(listener({ type: OPEN_SIGN_IN_MESSAGE }, sender('http://localhost:30000/setup'), vi.fn())).toBe(false);
    await vi.waitFor(() => {
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
    });
  });

  test('opens the sign-in only for a tab EMMA was brought into', async () => {
    const { chrome, onOpenSignIn } = await load();
    expect(await onOpenSignIn(sender('http://localhost:30000/setup'))).toBe(false);
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  test('answers nothing when asking fails', async () => {
    const { chrome, session, listeners } = await load();
    session.set(RELAY_TABS_KEY, relayed[RELAY_TABS_KEY]);
    chrome.storage.session.get.mockRejectedValue(new Error('gone'));
    const respond = vi.fn();
    (listeners.message[0] as (m: unknown, f: chrome.runtime.MessageSender, r: (a: unknown) => void) => boolean)(
      { type: CATALOGUE_REQUEST_MESSAGE, request: REQUEST },
      sender('http://localhost:30000/setup'),
      respond,
    );
    await vi.waitFor(() => {
      expect(respond).toHaveBeenCalledWith(undefined);
    });
  });
});
