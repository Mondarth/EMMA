// @vitest-environment node
/**
 * The setup screen's dev server, standing in for the browser extension: the developer's token, the relay to the
 * development catalogue, and signing in to it.
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { relayCatalogue, relayed } from '../../../scripts/dev/catalogue-relay';
import { forgetDevToken, readDevToken, TOKEN_FILE, writeDevToken } from '../../../scripts/dev/catalogue-token';
import { devSignIn, main } from '../../../scripts/dev/sign-in';

const CATALOGUE = 'http://localhost:5173/';

let root: string;
const servers: http.Server[] = [];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-dev-'));
});

afterEach(async () => {
  fs.rmSync(root, { recursive: true, force: true });
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

/**
 * A `fetch` answering each call in turn.
 * @param answers - The answers, or errors to fail with
 * @returns The `fetch`
 */
function answering(...answers: (Response | Error)[]) {
  return vi.fn<typeof fetch>(() => {
    const next = answers.shift() ?? new Error('no more answers');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

/**
 * Where a request went.
 * @param input - What it was asked with
 * @returns Its URL
 */
const hrefOf = (input: RequestInfo | URL) => (input instanceof Request ? input.url : input.toString());

describe("the developer's token", () => {
  test('is kept for its catalogue alone, in a file only its owner reads, and forgotten', () => {
    expect(readDevToken(root, CATALOGUE)).toBeUndefined();
    writeDevToken(root, CATALOGUE, 't0k3n');
    expect(readDevToken(root, CATALOGUE)).toBe('t0k3n');
    expect(readDevToken(root, 'http://elsewhere.test/')).toBeUndefined();
    expect(fs.statSync(path.join(root, TOKEN_FILE)).mode & 0o077).toBe(0);
    forgetDevToken(root);
    expect(readDevToken(root, CATALOGUE)).toBeUndefined();
  });

  test('is none for a file that holds anything else', () => {
    fs.mkdirSync(path.join(root, '.foundryvtt'));
    fs.writeFileSync(path.join(root, TOKEN_FILE), 'not json');
    expect(readDevToken(root, CATALOGUE)).toBeUndefined();
    fs.writeFileSync(path.join(root, TOKEN_FILE), JSON.stringify({ catalogue: CATALOGUE, token: '' }));
    expect(readDevToken(root, CATALOGUE)).toBeUndefined();
  });
});

describe('relayed', () => {
  const ME = { url: `${CATALOGUE}api/v2/me`, method: 'GET', headers: { cookie: 'c=1', 'x-api-key': '' } };

  test('asks the catalogue with the token alone, and gives back what the extension would', async () => {
    const send = answering(
      new Response('{"me":1}', { headers: { 'Content-Type': 'application/json', 'X-Other': 'x' } }),
    );
    expect(await relayed(ME, CATALOGUE, 't0k3n', send)).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"me":1}',
    });
    expect(send).toHaveBeenCalledWith(`${CATALOGUE}api/v2/me`, {
      method: 'GET',
      headers: { authorization: 'Bearer t0k3n' },
      redirect: 'error',
    });
  });

  test('passes a post’s body on', async () => {
    const send = answering(new Response('{}'));
    await relayed({ url: `${CATALOGUE}api/v2/lookup`, method: 'POST', headers: {}, body: '{}' }, CATALOGUE, 't', send);
    expect(send.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: '{}' });
  });

  test('answers as the catalogue would while no one is signed in, without asking it', async () => {
    const send = answering();
    expect(await relayed(ME, CATALOGUE, undefined, send)).toMatchObject({ status: 401 });
    expect(send).not.toHaveBeenCalled();
  });

  test('refuses what the extension refuses, and says when the catalogue could not be reached', async () => {
    expect(
      await relayed({ ...ME, url: 'http://elsewhere.test/api/v2/me' }, CATALOGUE, 't', answering()),
    ).toBeUndefined();
    expect(await relayed(ME, CATALOGUE, 't', answering(new TypeError('Failed to fetch')))).toEqual({
      unreachable: true,
    });
  });
});

describe('the relay plugin', () => {
  type Middleware = (request: http.IncomingMessage, response: http.ServerResponse) => void;

  /**
   * Start the plugin's middleware, as Vite would, at its path.
   * @param send - How it asks the catalogue
   * @returns The dev server's address, and the path the middleware was given
   */
  async function devServer(send: typeof fetch) {
    let mounted: { at: string; middleware: Middleware } | undefined;
    const plugin = relayCatalogue({ root, catalogue: CATALOGUE, base: '/dev/', fetch: send });
    const configure = plugin.configureServer as (server: ViteDevServer) => void;
    configure({
      middlewares: { use: (at: string, middleware: Middleware) => (mounted = { at, middleware }) },
    } as unknown as ViteDevServer);
    const server = http.createServer((request, response) => mounted?.middleware(request, response));
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, at: mounted?.at };
  }

  test("answers the dev bridge's JSON post with the catalogue's answer, reading the token each time", async () => {
    const send = answering(new Response('{"me":1}'));
    const { url, at } = await devServer(send);
    expect(at).toBe('/dev/catalogue');
    const post = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: `${CATALOGUE}api/v2/me`, method: 'GET', headers: {} }),
      }).then(response => response.json() as Promise<unknown>);

    expect(await post()).toMatchObject({ status: 401 });
    writeDevToken(root, CATALOGUE, 't0k3n');
    expect(await post()).toEqual({
      status: 200,
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: '{"me":1}',
    });
  });

  test('answers unreachable to a request it does not let through, or that is not JSON', async () => {
    const { url } = await devServer(answering());
    for (const body of ['{"url":"http://elsewhere.test/"}', 'not json']) {
      const answer = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      expect(await answer.json()).toEqual({ unreachable: true });
    }
  });

  test('refuses anything but a JSON post, which another site cannot make without a preflight', async () => {
    const { url } = await devServer(answering());
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(url, { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } })).status).toBe(
      405,
    );
  });
});

describe('devSignIn', () => {
  const codes = (more: Record<string, unknown> = {}) =>
    Response.json({
      device_code: 'dev1ce',
      user_code: 'WDJBMJHT',
      verification_uri_complete: `${CATALOGUE}device?user_code=WDJBMJHT`,
      expires_in: 600,
      interval: 5,
      ...more,
    });
  const token = (body: Record<string, unknown>) => Response.json(body, { status: 'error' in body ? 400 : 200 });

  /**
   * A clock that the waits move on.
   * @returns The waits made, the time, and how to wait
   */
  function clock() {
    let time = 0;
    const waits: number[] = [];
    return {
      waits,
      now: () => time,
      wait: (ms: number) => {
        waits.push(ms);
        time += ms;
        return Promise.resolve();
      },
    };
  }

  test('says where to approve the code, polls, slower when told, and keeps the token for the catalogue', async () => {
    const lines: string[] = [];
    const { waits, now, wait } = clock();
    const send = answering(
      codes(),
      token({ error: 'authorization_pending' }),
      token({ error: 'slow_down' }),
      token({ access_token: 't0k3n' }),
    );

    expect(await devSignIn({ root, catalogue: CATALOGUE, fetch: send, log: line => lines.push(line), wait, now })).toBe(
      'approved',
    );
    expect(lines[0]).toContain(`${CATALOGUE}device?user_code=WDJBMJHT`);
    expect(lines[0]).toContain('WDJBMJHT');
    expect(waits).toEqual([5000, 5000, 10000]);
    expect(readDevToken(root, CATALOGUE)).toBe('t0k3n');
    expect(JSON.parse(send.mock.calls[0]?.[1]?.body as string)).toEqual({ client_id: 'emma-extension' });
    expect(JSON.parse(send.mock.calls[1]?.[1]?.body as string)).toEqual({
      client_id: 'emma-extension',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: 'dev1ce',
    });
  });

  test.each([
    ['denied', [token({ error: 'access_denied' })]],
    ['failed', [token({ error: 'invalid_grant' })]],
    ['failed', [new TypeError('Failed to fetch')]],
  ] as const)('ends %s as the catalogue says', async (end, polls) => {
    const { now, wait } = clock();
    const send = answering(codes(), ...polls);
    expect(await devSignIn({ root, catalogue: CATALOGUE, fetch: send, log: vi.fn(), wait, now })).toBe(end);
    expect(readDevToken(root, CATALOGUE)).toBeUndefined();
  });

  test('ends expired once the codes have', async () => {
    const { now, wait } = clock();
    const send = answering(codes({ expires_in: 4, interval: undefined }));
    expect(await devSignIn({ root, catalogue: CATALOGUE, fetch: send, log: vi.fn(), wait, now })).toBe('expired');
  });

  test('fails when the catalogue gives no codes, saying to check it runs', async () => {
    const log = vi.fn();
    for (const answer of [new Response('{}', { status: 400 }), new TypeError('Failed to fetch')]) {
      expect(await devSignIn({ root, catalogue: CATALOGUE, fetch: answering(answer), log })).toBe('failed');
    }
    expect(log).toHaveBeenCalledWith(expect.stringContaining('are they running'));
  });

  test('signs in at the development accounts, keeping the token for the catalogue', async () => {
    const { now, wait } = clock();
    const accounts = 'http://localhost:5174/';
    const send = answering(codes(), token({ access_token: 't0k3n' }));
    expect(await devSignIn({ root, catalogue: CATALOGUE, accounts, fetch: send, log: vi.fn(), wait, now })).toBe(
      'approved',
    );
    expect(send.mock.calls.map(([input]) => hrefOf(input))).toEqual([
      `${accounts}auth/device/code`,
      `${accounts}auth/device/token`,
    ]);
    expect(readDevToken(root, CATALOGUE)).toBe('t0k3n');
  });

  test('says things on the console, and waits in real time, by default', async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const signing = devSignIn({
      root,
      catalogue: CATALOGUE,
      fetch: answering(codes({ interval: 1 }), token({ access_token: 't0k3n' })),
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(signing).resolves.toBe('approved');
    expect(info).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('main', () => {
  test('signs out, forgetting the token', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    writeDevToken(root, CATALOGUE, 't0k3n');
    expect(await main(root, {}, ['--sign-out'])).toBe(0);
    expect(readDevToken(root, CATALOGUE)).toBeUndefined();
  });

  test('asks for the development catalogue first', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await main(root, {}, [])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('EMMA_DEV_CATALOGUE_URL'));
  });

  test('signs in to it', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', answering(new Response('{}', { status: 500 })));
    expect(await main(root, { EMMA_DEV_CATALOGUE_URL: CATALOGUE }, [])).toBe(1);
  });

  test('signs in at the development accounts, when they are named', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const send = answering(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', send);
    const env = { EMMA_DEV_CATALOGUE_URL: CATALOGUE, EMMA_DEV_ACCOUNTS_URL: 'http://localhost:5174/' };
    expect(await main(root, env, [])).toBe(1);
    expect(hrefOf(send.mock.calls[0]?.[0] ?? '')).toBe('http://localhost:5174/auth/device/code');
  });
});
