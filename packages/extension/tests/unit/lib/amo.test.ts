import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test, vi } from 'vitest';

import { AMO_API, amoFile, amoToken, editListing, submitListed, uploadListed } from '../../../scripts/amo.ts';
import type { AmoFile, AmoListing } from '../../../scripts/amo.ts';

const KEY = { issuer: 'user:12345:67', secret: 's3cret' };
const GUID = 'emma@mondarth';
const VERSION_URL = `${AMO_API}/addons/addon/emma%40mondarth/versions/v0.11.1/`;
const FILE: AmoFile = { url: 'https://addons.test/emma-0.11.1.xpi', status: 'public' };

/**
 * A send that answers each call in turn.
 * @param answers - The responses, in order
 * @returns The send
 */
function answering(...answers: Response[]) {
  const send = vi.fn<typeof globalThis.fetch>();
  for (const answer of answers) send.mockResolvedValueOnce(answer);
  return send;
}

const authorizationOf = (send: ReturnType<typeof answering>, call = 0) =>
  new Headers(send.mock.calls[call]?.[1]?.headers).get('Authorization');

describe('amoToken', () => {
  test('is a JWT for the key, signed with HS256 and good for a minute', () => {
    const token = amoToken(KEY, 1_700_000_000_500, 'an-id');
    const [header = '', payload = '', signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: KEY.issuer,
      jti: 'an-id',
      iat: 1_700_000_000,
      exp: 1_700_000_060,
    });
    expect(signature).toBe(createHmac('sha256', KEY.secret).update(`${header}.${payload}`).digest('base64url'));
  });

  test('has an id of its own each time', () => {
    expect(amoToken(KEY, 0)).not.toBe(amoToken(KEY, 0));
  });
});

describe('amoFile', () => {
  test('asks for the version by its number, with the key, and gives its file', async () => {
    const send = answering(Response.json({ version: '0.11.1', file: FILE }));
    expect(await amoFile(GUID, '0.11.1', { key: KEY, send })).toEqual(FILE);
    expect(send.mock.calls[0]?.[0]).toBe(VERSION_URL);
    expect(authorizationOf(send)).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  test('is nothing for a version AMO does not hold', async () => {
    expect(await amoFile(GUID, '0.11.1', { key: KEY, send: answering(new Response('', { status: 404 })) })).toBe(
      undefined,
    );
  });

  test('says what AMO answered otherwise', async () => {
    const send = answering(new Response('Incorrect authentication credentials.', { status: 401 }));
    await expect(amoFile(GUID, '0.11.1', { key: KEY, send })).rejects.toThrow(
      'AMO answered 401 for emma@mondarth 0.11.1: Incorrect authentication credentials.',
    );
  });

  test('refuses an answer without a file', async () => {
    const send = answering(Response.json({ version: '0.11.1' }));
    await expect(amoFile(GUID, '0.11.1', { key: KEY, send })).rejects.toThrow('AMO gave no file');
  });
});

const LISTING: AmoListing = {
  name: { 'en-US': 'EMMA for Foundry VTT' },
  summary: { 'en-US': 'Manage a Foundry VTT server.' },
  categories: { firefox: ['games-entertainment'] },
  support_url: { url: { 'en-US': 'https://github.com/Mondarth/EMMA/issues' } },
  version: { license: 'MIT', approval_notes: 'Run it on a Foundry VTT server.' },
};

/**
 * A request's JSON body, as sent.
 * @param send - The send
 * @param call - Which call
 * @returns The body
 */
const jsonOf = (send: ReturnType<typeof answering>, call: number): unknown =>
  JSON.parse(send.mock.calls[call]?.[1]?.body as string);

const formOf = (send: ReturnType<typeof answering>, call: number) => send.mock.calls[call]?.[1]?.body as FormData;

describe('editListing', () => {
  test("sets the add-on's own fields, but those AMO's edit does not take", async () => {
    const send = answering(Response.json({}));
    await editListing(GUID, LISTING, { key: KEY, send });
    expect(send.mock.calls[0]?.[0]).toBe(`${AMO_API}/addons/addon/emma%40mondarth/`);
    expect(send.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(jsonOf(send, 0)).toEqual({
      name: LISTING['name'],
      summary: LISTING['summary'],
      categories: LISTING['categories'],
    });
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).get('Content-Type')).toBe('application/json');
  });

  test('says what AMO answered when it refuses', async () => {
    const send = answering(new Response('{"summary":["Too long"]}', { status: 400 }));
    await expect(editListing(GUID, LISTING, { key: KEY, send })).rejects.toThrow(
      'AMO answered 400 to PATCH /addons/addon/emma%40mondarth/: {"summary":["Too long"]}',
    );
  });
});

describe('uploadListed', () => {
  const upload = (processed: boolean, valid = true, messages: { type: string; message: string }[] = []) =>
    Response.json({ uuid: 'u-1', processed, valid, validation: { messages } });

  test('uploads the build on the listed channel, and waits for it to be validated', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = answering(upload(false), upload(false), upload(true));
    expect(await uploadListed(Buffer.from('PK build'), { key: KEY, send, sleep })).toBe('u-1');
    expect(send.mock.calls[0]?.[0]).toBe(`${AMO_API}/addons/upload/`);
    expect(formOf(send, 0).get('channel')).toBe('listed');
    expect(formOf(send, 0).get('upload')).toBeInstanceOf(Blob);
    expect(send.mock.calls[1]?.[0]).toBe(`${AMO_API}/addons/upload/u-1/`);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  test("refuses a build AMO finds invalid, saying why, or with no reason AMO's", async () => {
    const errors = [
      { type: 'error', message: 'Unsupported manifest key' },
      { type: 'warning', message: 'Unsafe assignment' },
    ];
    await expect(
      uploadListed(Buffer.from(''), { key: KEY, send: answering(upload(true, false, errors)) }),
    ).rejects.toThrow('AMO found the build invalid: Unsupported manifest key');
    await expect(
      uploadListed(Buffer.from(''), {
        key: KEY,
        send: answering(Response.json({ uuid: 'u-1', processed: true, valid: false, validation: null })),
      }),
    ).rejects.toThrow('AMO found the build invalid: no reason given');
  });

  test('gives up when it is not validated within ten minutes', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(upload(false)));
    await expect(uploadListed(Buffer.from(''), { key: KEY, send, sleep })).rejects.toThrow(
      'AMO has not validated the upload u-1',
    );
    expect(send).toHaveBeenCalledTimes(60);
  });

  test('waits on a timer of its own when given none', async () => {
    vi.useFakeTimers();
    try {
      const uploading = uploadListed(Buffer.from(''), { key: KEY, send: answering(upload(false), upload(true)) });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await uploading).toBe('u-1');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('submitListed', () => {
  const files = { build: Buffer.from('PK build'), source: Buffer.from('PK source') };

  test('sets the listing, uploads the build, creates the version, then attaches its source', async () => {
    const send = answering(
      new Response('', { status: 404 }),
      Response.json({}),
      Response.json({ uuid: 'u-1', processed: true, valid: true }),
      Response.json({ id: 42 }),
      Response.json({ id: 42 }),
    );
    expect(await submitListed(GUID, '0.16.0', files, LISTING, { key: KEY, send })).toBe('submitted');

    expect(send.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url as string}`)).toEqual([
      `GET ${AMO_API}/addons/addon/emma%40mondarth/versions/v0.16.0/`,
      `PATCH ${AMO_API}/addons/addon/emma%40mondarth/`,
      `POST ${AMO_API}/addons/upload/`,
      `POST ${AMO_API}/addons/addon/emma%40mondarth/versions/`,
      `PATCH ${AMO_API}/addons/addon/emma%40mondarth/versions/42/`,
    ]);
    expect(jsonOf(send, 3)).toEqual({
      upload: 'u-1',
      license: 'MIT',
      approval_notes: 'Run it on a Foundry VTT server.',
    });
    expect(formOf(send, 4).get('source')).toBeInstanceOf(Blob);
  });

  test('gives no notes to the reviewers where the listing has none', async () => {
    const send = answering(
      new Response('', { status: 404 }),
      Response.json({}),
      Response.json({ uuid: 'u-1', processed: true, valid: true }),
      Response.json({ id: 42 }),
      Response.json({ id: 42 }),
    );
    const listing = { ...LISTING, version: { license: 'MIT' } };
    await submitListed(GUID, '0.16.0', files, listing, { key: KEY, send });
    expect(jsonOf(send, 3)).toEqual({ upload: 'u-1', license: 'MIT', approval_notes: '' });
  });

  test('submits nothing for a version AMO holds already, as a release run again', async () => {
    const send = answering(Response.json({ file: { url: 'https://addons.test/emma.xpi', status: 'unreviewed' } }));
    expect(await submitListed(GUID, '0.16.0', files, LISTING, { key: KEY, send })).toBe('held');
    expect(send).toHaveBeenCalledOnce();
  });
});

// Regression: AMO refused 0.16.0's listing, as `homepage` gave `{ url: { 'en-US': … } }`, the shape AMO answers with,
// where its add-on edit takes the translated value alone.
describe("the listing in store/amo-metadata.json, as AMO's add-on edit takes it", () => {
  const listing = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '../../../store/amo-metadata.json'), 'utf8'),
  ) as Record<string, unknown>;

  test.each(['name', 'summary', 'description', 'homepage'])('gives %s as text by language', field => {
    const translated = listing[field] as Record<string, unknown>;
    expect(Object.keys(translated)).toEqual(['en-US']);
    expect(typeof translated['en-US']).toBe('string');
  });

  test("gives Firefox's categories, and the version's licence", () => {
    expect(listing['categories']).toEqual({ firefox: ['games-entertainment'] });
    expect(listing['version']).toMatchObject({ license: 'MIT' });
  });
});
