import { describe, expect, test, vi } from 'vitest';

import type { BridgePost, PagePost, RelayAnswer } from '@mondarth/emma-core/catalogue-relay';
import { BRIDGE_SOURCE } from '@mondarth/emma-core/catalogue-relay';

import type { RelayWindow } from '../../../src/foundry/catalogue-relay';
import {
  AccountRequired,
  builtCatalogue,
  openSignIn,
  readAccount,
  relayFetch,
  requireAccount,
} from '../../../src/foundry/catalogue-relay';

const CATALOGUE = 'https://catalogue.example.test/';
const ORIGIN = 'http://localhost:30000';

/**
 * A window the page posts to, with the extension's bridge answering each request as the test says.
 * @param answer - What the bridge answers a request with, or `undefined` for no answer
 * @returns The window, and what was posted to it
 */
function bridged(answer: (post: PagePost) => RelayAnswer | undefined) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const posts: { message: PagePost; origin: string }[] = [];
  const target: RelayWindow = {
    location: { origin: ORIGIN },
    addEventListener: ((_type: string, listener: (event: MessageEvent) => void) => {
      listeners.add(listener);
    }) as RelayWindow['addEventListener'],
    removeEventListener: ((_type: string, listener: (event: MessageEvent) => void) => {
      listeners.delete(listener);
    }) as RelayWindow['removeEventListener'],
    postMessage: ((message: PagePost, origin: string) => {
      posts.push({ message, origin });
      const given = answer(message);
      if (given === undefined) return;
      const hear = (data: unknown, source: unknown = target) => {
        for (const listener of [...listeners]) listener({ data, source } as MessageEvent);
      };
      queueMicrotask(() => {
        // Others' posts are not heard: another frame's, another id's, or not the bridge's.
        hear({ source: BRIDGE_SOURCE, id: message.id, answer: given }, {});
        hear({ source: BRIDGE_SOURCE, id: 'another', answer: { status: 500, headers: {}, body: '' } });
        hear({ source: 'someone-else', id: message.id, answer: given });
        hear(null);
        hear({ source: BRIDGE_SOURCE, id: message.id, answer: given } satisfies BridgePost);
      });
    }) as RelayWindow['postMessage'],
  };
  return { target, posts, listeners };
}

describe('relayFetch', () => {
  test('posts the request to the bridge, from the page, to its own origin, and gives back the answer', async () => {
    const { target, posts, listeners } = bridged(() => ({
      status: 200,
      headers: { 'content-type': 'application/json', etag: '"e1"' },
      body: '{"packages":[]}',
    }));
    const response = await relayFetch(target)(`${CATALOGUE}api/v2/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': '' },
      body: '{"packages":[]}',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).toBe('"e1"');
    expect(await response.json()).toEqual({ packages: [] });
    expect(posts).toEqual([
      {
        origin: ORIGIN,
        message: {
          source: 'mondarth-emma/page',
          id: expect.any(String) as string,
          request: {
            url: `${CATALOGUE}api/v2/lookup`,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': '' },
            body: '{"packages":[]}',
          },
        },
      },
    ]);
    // It stops listening once answered.
    expect(listeners.size).toBe(0);
  });

  test('asks a GET with no body, and gives a 304 as one, with none', async () => {
    const { target, posts } = bridged(() => ({ status: 304, headers: { etag: '"e1"' }, body: '' }));
    const response = await relayFetch(target)(`${CATALOGUE}api/v2/listing?type=module`, {
      headers: { 'If-None-Match': '"e1"' },
    });

    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(posts[0]?.message).toMatchObject({ request: { method: 'GET', headers: { 'if-none-match': '"e1"' } } });
    expect(posts[0]?.message).not.toHaveProperty('request.body');
  });

  test('fails as a network failure does when the catalogue could not be reached', async () => {
    const { target } = bridged(() => ({ unreachable: true }));
    await expect(relayFetch(target)(`${CATALOGUE}api/v2/lookup`, { method: 'POST' })).rejects.toThrow(TypeError);
  });

  test('fails when no bridge answers in time, as where the extension did not bring EMMA in', async () => {
    vi.useFakeTimers();
    const { target, listeners } = bridged(() => undefined);
    const asked = relayFetch(target, 1000)(`${CATALOGUE}api/v2/me`);
    const failed = expect(asked).rejects.toThrow(TypeError);
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });
});

describe('readAccount and requireAccount', () => {
  const me = (entitled: boolean, paidUntil: string | null): RelayAnswer => ({
    status: 200,
    headers: {},
    body: JSON.stringify({ user: { handle: 'h' }, subscription: { paidUntil, active: entitled }, entitled }),
  });

  test('asks the catalogue whose token the extension holds', async () => {
    const { target, posts } = bridged(() => me(true, null));
    expect(await readAccount(CATALOGUE, target)).toEqual({ state: 'entitled', handle: 'h', paidUntil: null });
    expect(posts[0]?.message).toMatchObject({
      request: { url: 'https://catalogue.example.test/api/v2/me', method: 'GET', headers: {} },
    });
  });

  test('lets a subscriber, and a catalogue that cannot be reached, go on to ask it', async () => {
    await expect(
      requireAccount(CATALOGUE, () => Promise.resolve({ state: 'entitled', handle: 'h', paidUntil: null })),
    ).resolves.toBeUndefined();
    await expect(requireAccount(CATALOGUE, () => Promise.resolve({ state: 'unreachable' }))).resolves.toBeUndefined();
  });

  test('asks the user to sign in, or renew at the catalogue’s subscription page', async () => {
    await expect(requireAccount(CATALOGUE, () => Promise.resolve({ state: 'signed-out' }))).rejects.toEqual(
      new AccountRequired({ reason: 'signed-out' }),
    );
    const lapsed = await requireAccount(CATALOGUE, () =>
      Promise.resolve({ state: 'lapsed', paidUntil: '2026-10-01T00:00:00.000Z' }),
    ).catch((error: unknown) => error);
    expect(lapsed).toBeInstanceOf(AccountRequired);
    expect((lapsed as AccountRequired).problem).toEqual({
      reason: 'lapsed',
      paidUntil: '2026-10-01T00:00:00.000Z',
      renew: 'https://catalogue.example.test/subscription',
    });
    expect((lapsed as AccountRequired).message).toMatch(/renew/);
  });

  test('reads the account through the bridge by default', async () => {
    const { target } = bridged(() => ({ status: 401, headers: {}, body: '' }));
    vi.stubGlobal('window', target);
    await expect(requireAccount(CATALOGUE)).rejects.toBeInstanceOf(AccountRequired);
  });
});

describe('openSignIn', () => {
  test('asks the extension to open its sign-in, from the page', () => {
    const { target, posts } = bridged(() => undefined);
    openSignIn(target);
    expect(posts).toEqual([
      { origin: ORIGIN, message: { source: 'mondarth-emma/page', id: expect.any(String) as string, openSignIn: true } },
    ]);
  });
});

describe('builtCatalogue', () => {
  test('is none in tests, which are built without one', () => {
    expect(builtCatalogue()).toBeNull();
  });
});
