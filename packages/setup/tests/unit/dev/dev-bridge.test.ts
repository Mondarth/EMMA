import { describe, expect, test, vi } from 'vitest';

import { BRIDGE_SOURCE, PAGE_SOURCE } from '@mondarth/emma-core/catalogue-relay';

import type { BridgeWindow } from '../../../src/dev/dev-bridge';
import { startDevBridge } from '../../../src/dev/dev-bridge';

/**
 * A window the page posts to, with the dev bridge listening on it.
 * @param send - How the bridge asks the dev server
 * @returns The window, how the page posts, and what the bridge posted back
 */
function bridged(send: typeof fetch) {
  let listener: ((event: MessageEvent) => void) | undefined;
  const target = {
    location: { origin: 'http://localhost:31003' },
    addEventListener: (_type: string, given: (event: MessageEvent) => void) => {
      listener = given;
    },
    postMessage: vi.fn(),
    alert: vi.fn(),
  } as unknown as BridgeWindow & { postMessage: ReturnType<typeof vi.fn>; alert: ReturnType<typeof vi.fn> };
  startDevBridge(target, '/dev/catalogue', send);
  const post = (data: unknown, source: unknown = target) => {
    listener?.({ data, source } as MessageEvent);
  };
  return { target, post };
}

const REQUEST = { url: 'http://localhost:5173/api/v2/me', method: 'GET', headers: {} };

describe('the dev bridge', () => {
  test("posts the page's request to the dev server, and the answer back to the page", async () => {
    const answer = { status: 200, headers: {}, body: '{}' };
    const send = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(answer)));
    const { target, post } = bridged(send);

    post({ source: PAGE_SOURCE, id: 'r1', request: REQUEST });

    await vi.waitFor(() => {
      expect(target.postMessage).toHaveBeenCalledWith(
        { source: BRIDGE_SOURCE, id: 'r1', answer },
        'http://localhost:31003',
      );
    });
    expect(send).toHaveBeenCalledWith('/dev/catalogue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(REQUEST),
    });
  });

  test('answers unreachable when the dev server does not answer', async () => {
    const { target, post } = bridged(() => Promise.reject(new TypeError('Failed to fetch')));
    post({ source: PAGE_SOURCE, id: 'r2', request: REQUEST });
    await vi.waitFor(() => {
      expect(target.postMessage).toHaveBeenCalledWith(
        { source: BRIDGE_SOURCE, id: 'r2', answer: { unreachable: true } },
        'http://localhost:31003',
      );
    });
  });

  test('says how to sign in, as the extension would open its sign-in', () => {
    const send = vi.fn<typeof fetch>();
    const { target, post } = bridged(send);
    post({ source: PAGE_SOURCE, id: 's1', openSignIn: true });
    expect(target.alert).toHaveBeenCalledWith(expect.stringContaining('pnpm dev:sign-in'));
    expect(send).not.toHaveBeenCalled();
  });

  test.each([
    ['another frame', { source: PAGE_SOURCE, id: 'x', request: REQUEST }, {}],
    ['someone else', { source: 'other', id: 'x', request: REQUEST }, undefined],
    ['no id', { source: PAGE_SOURCE, request: REQUEST }, undefined],
    ['nothing', null, undefined],
  ])('ignores a post from %s', (_why, data, source) => {
    const send = vi.fn<typeof fetch>();
    const { post } = bridged(send);
    post(data, source);
    expect(send).not.toHaveBeenCalled();
  });

  test('listens on the page’s window by default', () => {
    const listen = vi.spyOn(window, 'addEventListener');
    startDevBridge(window, '/dev/catalogue');
    expect(listen).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
