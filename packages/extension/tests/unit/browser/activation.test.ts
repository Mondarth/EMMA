import { describe, expect, test, vi } from 'vitest';

import { PENDING_KEY, SITES_KEY } from '../../../src/browser/api';
import { installChromeMock } from '../../mocks/chrome';

const LOCAL = 'http://localhost:30000';

/**
 * Install the browser's stand-in, with an activation kept, and load the activation afresh.
 * @param pending - What the session storage holds for it
 * @returns The mock and `finishActivation`
 */
async function load(pending: unknown) {
  const mocks = installChromeMock();
  mocks.session.set(PENDING_KEY, pending);
  mocks.origins.add('http://localhost:30000/*');
  vi.resetModules();
  const { finishActivation } = await import('../../../src/browser/activation');
  return { ...mocks, finishActivation };
}

describe('finishActivation', () => {
  test('finishes even if the tab it was activated from has gone', async () => {
    const { chrome, storage, finishActivation } = await load({ server: LOCAL, tabId: 7, url: `${LOCAL}/setup` });
    chrome.scripting.executeScript.mockRejectedValueOnce(new Error('No tab with id: 7'));

    await expect(finishActivation()).resolves.toBe(true);

    expect(storage.get(SITES_KEY)).toEqual([{ origin: LOCAL, auto: true }]);
  });

  test('remembers the server without opening EMMA when no tab is kept', async () => {
    const { chrome, storage, finishActivation } = await load({ server: LOCAL });

    await expect(finishActivation()).resolves.toBe(true);

    expect(storage.get(SITES_KEY)).toEqual([{ origin: LOCAL, auto: true }]);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  test.each([
    ['nothing kept', undefined],
    ['something that is not an activation', 'http://localhost:30000'],
    ['an activation without a server', { tabId: 7 }],
  ])('does nothing with %s', async (_label, pending) => {
    const { storage, session, finishActivation } = await load(pending);

    await expect(finishActivation()).resolves.toBe(false);

    expect(storage.has(SITES_KEY)).toBe(false);
    expect(session.has(PENDING_KEY)).toBe(false);
  });

  test('drops an activation whose permission is not held, as the user did not allow it', async () => {
    const { origins, storage, session, finishActivation } = await load({
      server: LOCAL,
      tabId: 7,
      url: `${LOCAL}/setup`,
    });
    origins.clear();

    await expect(finishActivation()).resolves.toBe(false);

    expect(storage.has(SITES_KEY)).toBe(false);
    expect(session.has(PENDING_KEY)).toBe(false);
  });

  test('carries on after a failure', async () => {
    const { chrome, finishActivation, session } = await load({ server: LOCAL });
    chrome.storage.local.set.mockRejectedValueOnce(new Error('quota'));

    await expect(finishActivation()).rejects.toThrow('quota');
    session.set(PENDING_KEY, { server: LOCAL });
    await expect(finishActivation()).resolves.toBe(true);
  });
});
