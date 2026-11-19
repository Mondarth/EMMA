import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  BRIDGE_SOURCE,
  CATALOGUE_REQUEST_MESSAGE,
  OPEN_SIGN_IN_MESSAGE,
  PAGE_SOURCE,
} from '@mondarth/emma-core/catalogue-relay';

import { installChromeMock } from '../../mocks/chrome';

/** The bridge, a classic script rather than a module, imported by a path TypeScript does not follow. */
const BRIDGE: string = '../../../src/bridge.ts';

/** The listeners each bringing-in of the bridge added, removed after each test, as the window outlives them. */
const added: EventListenerOrEventListenerObject[] = [];

const REQUEST = { url: 'https://catalogue.example.test/api/v2/me', method: 'GET', headers: {} };

/**
 * Bring the bridge in afresh, with the background answering as a test says.
 * @param answer - What the background answers a request with
 * @returns The mock, and the posts the bridge makes to the window
 */
async function load(answer: () => Promise<unknown> = () => Promise.resolve({ status: 200, headers: {}, body: '{}' })) {
  const mocks = installChromeMock();
  mocks.chrome.runtime.sendMessage.mockImplementation(answer);
  const posted = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  const adding = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    added.push(listener);
    adding(type, listener, options);
  });
  vi.resetModules();
  await import(BRIDGE);
  return { ...mocks, posted };
}

/**
 * A message the page, or something else, posts to the window.
 * @param data - What is posted
 * @param from - Who posts it
 * @param from.source - The window it comes from; this one by default
 * @param from.origin - Its origin; the page's own by default
 */
function post(data: unknown, from: { source?: unknown; origin?: string } = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: from.origin ?? location.origin,
      source: (from.source ?? window) as Window,
    }),
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__mondarthEmmaBridge');
  for (const listener of added.splice(0)) window.removeEventListener('message', listener);
});

describe('the bridge', () => {
  test("names the messages as EMMA's setup screen and background do", () => {
    const bridge = fs.readFileSync(path.resolve(import.meta.dirname, '../../../src/bridge.ts'), 'utf8');
    expect(bridge).toContain(`const PAGE = '${PAGE_SOURCE}';`);
    expect(bridge).toContain(`const BRIDGE = '${BRIDGE_SOURCE}';`);
    expect(bridge).toContain(`const REQUEST = '${CATALOGUE_REQUEST_MESSAGE}';`);
    expect(bridge).toContain(`const OPEN_SIGN_IN = '${OPEN_SIGN_IN_MESSAGE}';`);
  });

  test("takes the page's request to the background, and posts its answer back, to the page's own origin", async () => {
    const { chrome, posted } = await load();

    post({ source: PAGE_SOURCE, id: 'r1', request: REQUEST });

    await vi.waitFor(() => {
      expect(posted).toHaveBeenCalledWith(
        { source: BRIDGE_SOURCE, id: 'r1', answer: { status: 200, headers: {}, body: '{}' } },
        location.origin,
      );
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: CATALOGUE_REQUEST_MESSAGE, request: REQUEST });
  });

  test.each([
    ['gives nothing', () => Promise.resolve(undefined)],
    ['fails', () => Promise.reject(new Error('gone'))],
  ])('answers unreachable when the background %s', async (_why, answer) => {
    const { posted } = await load(answer);
    post({ source: PAGE_SOURCE, id: 'r2', request: REQUEST });
    await vi.waitFor(() => {
      expect(posted).toHaveBeenCalledWith(
        { source: BRIDGE_SOURCE, id: 'r2', answer: { unreachable: true } },
        location.origin,
      );
    });
  });

  test('asks the background to open the sign-in, answering nothing', async () => {
    const { chrome, posted } = await load();

    post({ source: PAGE_SOURCE, id: 's1', openSignIn: true });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: OPEN_SIGN_IN_MESSAGE });
    expect(posted).not.toHaveBeenCalled();
  });

  test.each([
    ['another frame', { source: PAGE_SOURCE, id: 'x', request: REQUEST }, { source: {} }],
    ['another origin', { source: PAGE_SOURCE, id: 'x', request: REQUEST }, { origin: 'https://evil.example.test' }],
    ['someone else', { source: 'someone-else', id: 'x', request: REQUEST }, {}],
    ['no id', { source: PAGE_SOURCE, request: REQUEST }, {}],
    ['nothing', null, {}],
    ['text', 'hello', {}],
  ])('ignores a post from %s', async (_why, data, from) => {
    const { chrome } = await load();
    post(data, from);
    await new Promise(resolve => setTimeout(resolve));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('listens once, however often EMMA is brought in', async () => {
    const { chrome } = await load();
    vi.resetModules();
    await import(BRIDGE);

    post({ source: PAGE_SOURCE, id: 's2', openSignIn: true });

    expect(added).toHaveLength(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });
});
