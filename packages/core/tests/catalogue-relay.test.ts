import { describe, expect, test } from 'vitest';

import { accountOf, parseRelayRequest, RELAY_PATHS } from '../src/catalogue-relay';

const CATALOGUE = 'https://catalogue.example.test/';

describe('parseRelayRequest', () => {
  test("lets each endpoint the extension asks through, to the catalogue's own origin, with its query", () => {
    for (const path of RELAY_PATHS) {
      expect(parseRelayRequest({ url: `${CATALOGUE}${path.slice(1)}`, method: 'GET', headers: {} }, CATALOGUE)).toEqual(
        {
          url: `https://catalogue.example.test${path}`,
          method: 'GET',
          headers: {},
        },
      );
    }
    expect(parseRelayRequest({ url: `${CATALOGUE}api/v2/listing?type=module`, method: 'GET' }, CATALOGUE)?.url).toBe(
      'https://catalogue.example.test/api/v2/listing?type=module',
    );
  });

  test('keeps a post’s body, and only the headers it lets through, lower-cased', () => {
    expect(
      parseRelayRequest(
        {
          url: `${CATALOGUE}api/v2/lookup`,
          method: 'POST',
          body: '{"packages":[]}',
          headers: {
            'Content-Type': 'application/json',
            'X-Catalogue-Client': 'EMMA-extension/0.12.0',
            'If-None-Match': '"e1"',
            'X-API-Key': '',
            Authorization: 'Bearer not-the-page’s-to-give',
            Cookie: 'a=b',
          },
        },
        CATALOGUE,
      ),
    ).toEqual({
      url: 'https://catalogue.example.test/api/v2/lookup',
      method: 'POST',
      body: '{"packages":[]}',
      headers: {
        'content-type': 'application/json',
        'x-catalogue-client': 'EMMA-extension/0.12.0',
        'if-none-match': '"e1"',
      },
    });
  });

  test.each([
    ['another origin', { url: 'https://elsewhere.example.test/api/v2/lookup', method: 'POST' }],
    ['another scheme', { url: 'http://catalogue.example.test/api/v2/lookup', method: 'POST' }],
    ['another port', { url: 'https://catalogue.example.test:8443/api/v2/lookup', method: 'POST' }],
    ['credentials in the URL', { url: 'https://user:pass@catalogue.example.test/api/v2/lookup', method: 'POST' }],
    ['a fragment', { url: `${CATALOGUE}api/v2/lookup#x`, method: 'POST' }],
    ['an endpoint it does not ask', { url: `${CATALOGUE}api/v2/status`, method: 'GET' }],
    ['the website', { url: `${CATALOGUE}profile`, method: 'GET' }],
    ['signing in', { url: `${CATALOGUE}auth/device/token`, method: 'POST' }],
    ['a path that climbs out', { url: `${CATALOGUE}api/v2/lookup/../../auth/sign-out`, method: 'POST' }],
    ['another method', { url: `${CATALOGUE}api/v2/lookup`, method: 'DELETE' }],
    ['a GET with a body', { url: `${CATALOGUE}api/v2/me`, method: 'GET', body: 'x' }],
    ['a body that is not text', { url: `${CATALOGUE}api/v2/lookup`, method: 'POST', body: {} }],
    ['no URL', { method: 'GET' }],
    ['a URL that is not one', { url: 'not a url', method: 'GET' }],
    ['nothing', null],
    ['text', 'GET /api/v2/me'],
  ])('refuses %s', (_why, given) => {
    expect(parseRelayRequest(given, CATALOGUE)).toBeUndefined();
  });
});

describe('accountOf', () => {
  const me = (entitled: boolean, paidUntil: string | null) => ({
    status: 200,
    headers: {},
    body: JSON.stringify({
      user: { handle: 'crimson-bell-trail-58', nickname: null, role: 'user' },
      subscription: { paidUntil, active: entitled },
      entitled,
    }),
  });

  test('is entitled, with whose token it is, while subscribed', () => {
    expect(accountOf(me(true, '2027-01-01T00:00:00.000Z'))).toEqual({
      state: 'entitled',
      handle: 'crimson-bell-trail-58',
      paidUntil: '2027-01-01T00:00:00.000Z',
    });
  });

  test('is lapsed, with when it ended, or never began', () => {
    expect(accountOf(me(false, '2026-10-01T00:00:00.000Z'))).toEqual({
      state: 'lapsed',
      paidUntil: '2026-10-01T00:00:00.000Z',
    });
    expect(accountOf(me(false, null))).toEqual({ state: 'lapsed', paidUntil: null });
  });

  test('is signed out when the catalogue does not take the token', () => {
    expect(accountOf({ status: 401, headers: {}, body: '' })).toEqual({ state: 'signed-out' });
  });

  test.each([
    ['no answer', { unreachable: true } as const],
    ['a server error', { status: 503, headers: {}, body: '' }],
    ['an answer that is not JSON', { status: 200, headers: {}, body: '<html>' }],
    ['an answer of another shape', { status: 200, headers: {}, body: '{"user":{}}' }],
  ])('is unreachable for %s', (_why, answer) => {
    expect(accountOf(answer)).toEqual({ state: 'unreachable' });
  });
});
