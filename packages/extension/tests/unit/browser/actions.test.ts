import { describe, expect, test } from 'vitest';

import { activate, forget, openOnce, setAuto } from '../../../src/browser/actions';
import { LOADER_ID, SITES_KEY } from '../../../src/browser/api';
import { installChromeMock } from '../../mocks/chrome';

const LOCAL = 'http://localhost:30000';

describe('activate', () => {
  test("asks for the server's permission, remembers it, registers the loader and opens EMMA", async () => {
    const { chrome, storage, registered, origins } = installChromeMock();

    await expect(activate({ id: 7, url: `${LOCAL}/setup` })).resolves.toBe('activated');

    expect(origins).toEqual(new Set(['http://localhost:30000/*']));
    expect(storage.get(SITES_KEY)).toEqual([{ origin: LOCAL, auto: true }]);
    expect(registered.get(LOADER_ID)).toEqual({
      id: LOADER_ID,
      matches: ['http://localhost:30000/*'],
      js: ['loader.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    });
    expect(chrome.scripting.executeScript).toHaveBeenCalledExactlyOnceWith({
      target: { tabId: 7 },
      files: ['emma-setup.js'],
      world: 'MAIN',
    });
  });

  test('asks for the permission before anything else, while the click still counts', async () => {
    const { chrome } = installChromeMock();

    await activate({ id: 7, url: `${LOCAL}/setup` });

    const asked = chrome.permissions.request.mock.invocationCallOrder[0] ?? Infinity;
    const read = chrome.storage.local.get.mock.invocationCallOrder[0] ?? -Infinity;
    expect(asked).toBeLessThan(read);
  });

  test('remembers a server from a page that is not its setup screen, without opening EMMA', async () => {
    const { chrome, storage } = installChromeMock();

    await expect(activate({ id: 7, url: `${LOCAL}/game` })).resolves.toBe('activated');

    expect(storage.get(SITES_KEY)).toEqual([{ origin: LOCAL, auto: true }]);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  test('changes nothing when the user does not allow it', async () => {
    const { chrome, storage } = installChromeMock({ allow: false });

    await expect(activate({ id: 7, url: `${LOCAL}/setup` })).resolves.toBe('refused');

    expect(storage.has(SITES_KEY)).toBe(false);
    expect(chrome.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  test('does nothing for a page not on a web server', async () => {
    const { chrome } = installChromeMock();

    await expect(activate({ id: 7, url: 'chrome://extensions' })).resolves.toBe('unsupported');

    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
});

describe('openOnce', () => {
  test('opens EMMA in a setup screen without remembering anything', async () => {
    const { chrome, storage } = installChromeMock();

    await expect(openOnce({ id: 7, url: `${LOCAL}/setup` })).resolves.toBe(true);

    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });

  test.each([
    ['a page that is not a setup screen', { id: 7, url: `${LOCAL}/game` }],
    ['a tab without an ID', { url: `${LOCAL}/setup` }],
  ])('does nothing on %s', async (_label, tab) => {
    const { chrome } = installChromeMock();

    await expect(openOnce(tab)).resolves.toBe(false);

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('setAuto', () => {
  test('registers the loader only for the servers EMMA opens on by itself', async () => {
    const { registered, storage } = installChromeMock({ storage: { [SITES_KEY]: [{ origin: LOCAL, auto: true }] } });
    registered.set(LOADER_ID, { id: LOADER_ID, matches: ['http://localhost:30000/*'] });

    await expect(setAuto(LOCAL, false)).resolves.toEqual([{ origin: LOCAL, auto: false }]);
    expect(registered.has(LOADER_ID)).toBe(false);
    expect(storage.get(SITES_KEY)).toEqual([{ origin: LOCAL, auto: false }]);

    await setAuto(LOCAL, true);
    expect(registered.get(LOADER_ID)?.matches).toEqual(['http://localhost:30000/*']);
  });
});

describe('forget', () => {
  test('forgets a server and gives up its permission', async () => {
    const { origins, registered, storage } = installChromeMock({
      storage: { [SITES_KEY]: [{ origin: LOCAL, auto: true }] },
    });
    origins.add('http://localhost:30000/*');

    await expect(forget(LOCAL)).resolves.toEqual([]);

    expect(storage.get(SITES_KEY)).toEqual([]);
    expect(origins.size).toBe(0);
    expect(registered.size).toBe(0);
  });
});
