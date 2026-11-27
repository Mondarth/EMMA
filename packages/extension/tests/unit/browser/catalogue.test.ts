import { describe, expect, test, vi } from 'vitest';

import { RELAY_TABS_KEY } from '../../../src/browser/api';
import {
  askCodes,
  forgetToken,
  keepToken,
  mayRelay,
  pollToken,
  readMe,
  readToken,
  relay,
  signIn,
  TOKEN_KEY,
} from '../../../src/browser/catalogue';
import { installChromeMock } from '../../mocks/chrome';

const CATALOGUE = 'https://catalogue.example.test/';
const LOCAL = 'http://localhost:30000';

/**
 * A `fetch` answering each call in turn, recording what it was asked.
 * @param answers - The answers, or the errors to fail with
 * @returns The `fetch`
 */
function answering(...answers: (Response | Error)[]) {
  return vi.fn<typeof fetch>(() => {
    const next = answers.shift() ?? new Error('no more answers');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

/**
 * What a `fetch` mock was asked, by call.
 * @param send - The mock
 * @param call - Which call
 * @returns Its URL, options and body
 */
const asked = (send: ReturnType<typeof answering>, call = 0) => {
  const [url, init] = send.mock.calls[call] ?? [];
  return { url, init, body: JSON.parse(typeof init?.body === 'string' ? init.body : 'null') as unknown };
};

describe('the token', () => {
  test('is kept, read and forgotten, in the extension’s storage', async () => {
    const { storage } = installChromeMock();
    expect(await readToken()).toBeUndefined();
    await keepToken('t0k3n');
    expect(storage.get(TOKEN_KEY)).toBe('t0k3n');
    expect(await readToken()).toBe('t0k3n');
    await forgetToken();
    expect(await readToken()).toBeUndefined();
  });

  test('is none for anything else stored under its key', async () => {
    installChromeMock({ storage: { [TOKEN_KEY]: '' } });
    expect(await readToken()).toBeUndefined();
    installChromeMock({ storage: { [TOKEN_KEY]: 42 } });
    expect(await readToken()).toBeUndefined();
  });
});

describe('mayRelay', () => {
  const sender = (change: Record<string, unknown> = {}) => ({
    id: 'emma-extension',
    frameId: 0,
    tab: { id: 7 },
    url: `${LOCAL}/setup`,
    ...change,
  });

  test('lets the top frame of a tab EMMA was brought into, still on its server, ask', async () => {
    const { session } = installChromeMock();
    session.set(RELAY_TABS_KEY, { '7': LOCAL });
    expect(await mayRelay(sender())).toBe(true);
  });

  test.each([
    ['another extension', sender({ id: 'other' })],
    ['a frame', sender({ frameId: 2 })],
    ['no tab', sender({ tab: undefined })],
    ['another tab', sender({ tab: { id: 8 } })],
    ['the tab moved to another server', sender({ url: 'https://elsewhere.example.test/setup' })],
    ['no address', sender({ url: undefined })],
  ])('refuses %s', async (_why, from) => {
    const { session } = installChromeMock();
    session.set(RELAY_TABS_KEY, { '7': LOCAL, '8': 'not-a-string-origin', '9': 42 });
    expect(await mayRelay(from)).toBe(false);
  });

  test('refuses every tab when none is kept', async () => {
    installChromeMock();
    expect(await mayRelay(sender())).toBe(false);
  });
});

describe('relay', () => {
  const LOOKUP = {
    url: `${CATALOGUE}api/v2/lookup`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': '', Authorization: 'Bearer page', Cookie: 'c=1' },
    body: '{"packages":[]}',
  };

  test('asks the catalogue as the user, with their token alone, never a cookie, and gives back its answer', async () => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    const send = answering(
      new Response('{"packages":[]}', {
        headers: { 'Content-Type': 'application/json', ETag: '"e1"', 'Set-Cookie': 'x=y', 'X-Other': 'z' },
      }),
    );

    expect(await relay(LOOKUP, CATALOGUE, send)).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json', etag: '"e1"' },
      body: '{"packages":[]}',
    });
    expect(send).toHaveBeenCalledExactlyOnceWith('https://catalogue.example.test/api/v2/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t0k3n' },
      body: '{"packages":[]}',
      credentials: 'omit',
      redirect: 'error',
    });
  });

  test('answers as the catalogue would, without asking it, while no one is signed in', async () => {
    installChromeMock();
    const send = answering();
    expect(await relay(LOOKUP, CATALOGUE, send)).toMatchObject({ status: 401 });
    expect(send).not.toHaveBeenCalled();
  });

  test('forgets a token the catalogue no longer takes', async () => {
    const { storage } = installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    await relay(
      { url: `${CATALOGUE}api/v2/me`, method: 'GET' },
      CATALOGUE,
      answering(new Response('', { status: 401 })),
    );
    expect(storage.has(TOKEN_KEY)).toBe(false);
  });

  test('keeps the token through any other refusal, such as a subscription that ended', async () => {
    const { storage } = installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    const answer = await relay(LOOKUP, CATALOGUE, answering(new Response('{}', { status: 403 })));
    expect(answer).toMatchObject({ status: 403 });
    expect(storage.get(TOKEN_KEY)).toBe('t0k3n');
  });

  test('says when the catalogue could not be reached', async () => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    expect(await relay(LOOKUP, CATALOGUE, answering(new TypeError('Failed to fetch')))).toEqual({ unreachable: true });
  });

  test.each([
    ['another site', { ...LOOKUP, url: 'https://elsewhere.example.test/api/v2/lookup' }],
    ['the website', { ...LOOKUP, url: `${CATALOGUE}auth/sign-out` }],
    ['nothing', undefined],
  ])('asks nothing for %s', async (_why, given) => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    const send = answering();
    expect(await relay(given, CATALOGUE, send)).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  test('asks nothing in a build without a catalogue', async () => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    expect(await relay(LOOKUP, null)).toBeUndefined();
  });
});

describe('askCodes', () => {
  const CODES = {
    device_code: 'dev1ce',
    user_code: 'WDJBMJHT',
    verification_uri: `${CATALOGUE}device`,
    verification_uri_complete: `${CATALOGUE}device?user_code=WDJBMJHT`,
    expires_in: 600,
    interval: 5,
  };

  test("asks the catalogue for codes, as EMMA's browser extension, without a cookie", async () => {
    const send = answering(Response.json(CODES));
    expect(await askCodes(CATALOGUE, send)).toEqual({
      deviceCode: 'dev1ce',
      userCode: 'WDJBMJHT',
      verificationUri: `${CATALOGUE}device?user_code=WDJBMJHT`,
      expiresIn: 600,
      interval: 5,
    });
    expect(asked(send)).toMatchObject({
      url: 'https://catalogue.example.test/auth/device/code',
      init: { method: 'POST', credentials: 'omit' },
      body: { client_id: 'emma-extension' },
    });
  });

  test('takes ten minutes and five seconds when the catalogue does not say', async () => {
    const rest: Partial<typeof CODES> = { ...CODES };
    delete rest.expires_in;
    delete rest.interval;
    expect(await askCodes(CATALOGUE, answering(Response.json(rest)))).toMatchObject({ expiresIn: 600, interval: 5 });
  });

  test.each([
    ['a refusal', new Response('{}', { status: 400 })],
    ['no codes', Response.json({})],
    ['a page on another site', Response.json({ ...CODES, verification_uri_complete: 'https://evil.example.test/' })],
    ['a page that is not an address', Response.json({ ...CODES, verification_uri_complete: 'nowhere' })],
    ['an answer that is not JSON', new Response('<html>')],
    ['no answer', new TypeError('Failed to fetch')],
  ])('gives none for %s', async (_why, answer) => {
    expect(await askCodes(CATALOGUE, answering(answer))).toBeUndefined();
  });
});

describe('pollToken', () => {
  test('asks for the token by the device code, as the grant says', async () => {
    const send = answering(Response.json({ access_token: 't0k3n', token_type: 'Bearer' }));
    expect(await pollToken(CATALOGUE, 'dev1ce', send)).toEqual({ state: 'approved', token: 't0k3n' });
    expect(asked(send)).toMatchObject({
      url: 'https://catalogue.example.test/auth/device/token',
      init: { method: 'POST', credentials: 'omit' },
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'dev1ce',
        client_id: 'emma-extension',
      },
    });
  });

  test.each([
    ['authorization_pending', 'pending'],
    ['slow_down', 'slow-down'],
    ['access_denied', 'denied'],
    ['expired_token', 'expired'],
    ['invalid_grant', 'failed'],
  ])('reads %s as %s', async (error, state) => {
    expect(await pollToken(CATALOGUE, 'dev1ce', answering(Response.json({ error }, { status: 400 })))).toEqual({
      state,
    });
  });

  test('fails when the catalogue could not be asked, or gave an empty token', async () => {
    expect(await pollToken(CATALOGUE, 'd', answering(new TypeError('Failed to fetch')))).toEqual({ state: 'failed' });
    expect(await pollToken(CATALOGUE, 'd', answering(Response.json({ access_token: '' })))).toEqual({
      state: 'failed',
    });
  });
});

describe('signIn', () => {
  const codes = (more: Record<string, unknown> = {}) =>
    Response.json({
      device_code: 'dev1ce',
      user_code: 'WDJBMJHT',
      verification_uri_complete: `${CATALOGUE}device?user_code=WDJBMJHT`,
      expires_in: 600,
      interval: 5,
      ...more,
    });
  const poll = (body: Record<string, unknown>) => Response.json(body, { status: 'error' in body ? 400 : 200 });

  /**
   * Waits that pass the time on, as the test's clock says.
   * @returns The waits made, the time now, and how to wait
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

  test('shows the code, opens the page, polls until approved, slower when told to, and keeps the token', async () => {
    const { storage } = installChromeMock();
    const { waits, now, wait } = clock();
    const onCodes = vi.fn();
    const open = vi.fn();
    const send = answering(
      codes(),
      poll({ error: 'authorization_pending' }),
      poll({ error: 'slow_down' }),
      poll({ access_token: 't0k3n' }),
    );

    expect(await signIn(CATALOGUE, { onCodes, openPage: open, fetch: send, wait, now })).toBe('approved');
    expect(onCodes).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'WDJBMJHT' }));
    expect(open).toHaveBeenCalledWith(`${CATALOGUE}device?user_code=WDJBMJHT`);
    expect(waits).toEqual([5000, 5000, 10000]);
    expect(storage.get(TOKEN_KEY)).toBe('t0k3n');
  });

  test.each([
    ['denied', poll({ error: 'access_denied' })],
    ['expired', poll({ error: 'expired_token' })],
    ['failed', new TypeError('Failed to fetch')],
  ])('ends %s as the catalogue says, keeping nothing', async (end, answer) => {
    const { storage } = installChromeMock();
    const { now, wait } = clock();
    const send = answering(codes(), answer);
    expect(await signIn(CATALOGUE, { onCodes: vi.fn(), openPage: vi.fn(), fetch: send, wait, now })).toBe(end);
    expect(storage.has(TOKEN_KEY)).toBe(false);
  });

  test('ends expired once the codes have, without asking again', async () => {
    installChromeMock();
    const { now, wait } = clock();
    const send = answering(codes({ expires_in: 8 }), poll({ error: 'authorization_pending' }));
    expect(await signIn(CATALOGUE, { onCodes: vi.fn(), openPage: vi.fn(), fetch: send, wait, now })).toBe('expired');
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('ends when the user cancels it', async () => {
    installChromeMock();
    const controller = new AbortController();
    const { now } = clock();
    const send = answering(codes());
    const wait = () => {
      controller.abort();
      return Promise.resolve();
    };
    expect(
      await signIn(CATALOGUE, {
        onCodes: vi.fn(),
        openPage: vi.fn(),
        fetch: send,
        wait,
        now,
        signal: controller.signal,
      }),
    ).toBe('cancelled');
    expect(send).toHaveBeenCalledOnce();
  });

  test('fails when the catalogue gives no codes', async () => {
    installChromeMock();
    const open = vi.fn();
    expect(
      await signIn(CATALOGUE, {
        onCodes: vi.fn(),
        openPage: open,
        fetch: answering(new Response('', { status: 500 })),
      }),
    ).toBe('failed');
    expect(open).not.toHaveBeenCalled();
  });

  test('waits in real time by default', async () => {
    vi.useFakeTimers();
    installChromeMock();
    const send = answering(codes({ interval: 1 }), poll({ access_token: 't0k3n' }));
    const signing = signIn(CATALOGUE, { onCodes: vi.fn(), openPage: vi.fn(), fetch: send });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(signing).resolves.toBe('approved');
    vi.useRealTimers();
  });
});

describe('readMe', () => {
  const ME = {
    user: { handle: 'crimson-bell-trail-58', nickname: null, role: 'user' },
    subscription: { paidUntil: '2027-01-01T00:00:00.000Z', active: true },
    entitled: true,
  };

  test('says whom the extension is signed in as, and whether they are subscribed', async () => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    expect(await readMe(CATALOGUE, answering(Response.json(ME)))).toEqual({
      state: 'signed-in',
      handle: 'crimson-bell-trail-58',
      nickname: null,
      entitled: true,
      paidUntil: '2027-01-01T00:00:00.000Z',
    });
  });

  test('gives the nickname the user set, or none where the catalogue gives none', async () => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    const named = { ...ME, user: { ...ME.user, nickname: 'Ulenar' } };
    expect(await readMe(CATALOGUE, answering(Response.json(named)))).toMatchObject({ nickname: 'Ulenar' });
    // From a catalogue before nicknames were told, or an empty one.
    const older = { handle: ME.user.handle, role: ME.user.role };
    expect(await readMe(CATALOGUE, answering(Response.json({ ...ME, user: older })))).toMatchObject({
      nickname: null,
    });
    expect(
      await readMe(CATALOGUE, answering(Response.json({ ...ME, user: { ...ME.user, nickname: '' } }))),
    ).toMatchObject({ nickname: null });
  });

  test('is signed out without a token, or with one the catalogue no longer takes', async () => {
    installChromeMock();
    expect(await readMe(CATALOGUE, answering())).toEqual({ state: 'signed-out' });
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    expect(await readMe(CATALOGUE, answering(new Response('', { status: 401 })))).toEqual({ state: 'signed-out' });
  });

  test.each([
    ['no answer', new TypeError('Failed to fetch')],
    ['a server error', new Response('', { status: 503 })],
    ['an answer that is not JSON', new Response('<html>')],
  ])('is unreachable for %s', async (_why, answer) => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    expect(await readMe(CATALOGUE, answering(answer))).toEqual({ state: 'unreachable' });
  });
});
