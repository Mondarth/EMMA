import { describe, expect, test, vi } from 'vitest';

import { LOADER_ID, SETUP_PAGE_MESSAGE, SITES_KEY } from '../../../src/browser/api';
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
});
