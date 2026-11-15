import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { AMO_API, amoFile, amoToken, differences, downloadAmoFile, signedAmoFile } from '../../../scripts/amo.ts';
import type { AmoFile } from '../../../scripts/amo.ts';

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

describe('signedAmoFile', () => {
  const version = (status: string) => Response.json({ file: { ...FILE, status } });

  test('gives the file once Mozilla has signed it, waiting while it is unreviewed', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = answering(version('unreviewed'), version('unreviewed'), version('public'));
    expect(await signedAmoFile(GUID, '0.11.1', { key: KEY, send, sleep })).toEqual(FILE);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test('is nothing for a version AMO does not hold', async () => {
    const send = answering(new Response('', { status: 404 }));
    expect(await signedAmoFile(GUID, '0.11.1', { key: KEY, send })).toBeUndefined();
  });

  test('stops at a version Mozilla refused', async () => {
    const send = answering(version('disabled'));
    await expect(signedAmoFile(GUID, '0.11.1', { key: KEY, send })).rejects.toThrow('Mozilla refused to sign');
  });

  test('gives up after twenty minutes unsigned', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(version('unreviewed')));
    await expect(signedAmoFile(GUID, '0.11.1', { key: KEY, send, sleep })).rejects.toThrow(
      'Mozilla has not signed emma@mondarth 0.11.1: it is unreviewed',
    );
    expect(send).toHaveBeenCalledTimes(40);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  test('waits on a timer of its own when given none', async () => {
    vi.useFakeTimers();
    try {
      const send = answering(version('unreviewed'), version('public'));
      const signed = signedAmoFile(GUID, '0.11.1', { key: KEY, send });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await signed).toEqual(FILE);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('downloadAmoFile', () => {
  const bytes = Buffer.from('PK signed add-on');
  const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

  test('downloads the file with the key, as AMO hashes it', async () => {
    const send = answering(new Response(bytes));
    expect(await downloadAmoFile({ ...FILE, hash: sha256 }, { key: KEY, send })).toEqual(bytes);
    expect(send.mock.calls[0]?.[0]).toBe(FILE.url);
    expect(authorizationOf(send)).toMatch(/^JWT /);
  });

  test('refuses a file that is not what its hash says', async () => {
    const send = answering(new Response('something else'));
    await expect(downloadAmoFile({ ...FILE, hash: sha256 }, { key: KEY, send })).rejects.toThrow(
      "is not the file AMO's hash says",
    );
  });

  test('takes a file without a hash it can check', async () => {
    expect(await downloadAmoFile(FILE, { key: KEY, send: answering(new Response(bytes)) })).toEqual(bytes);
    const md5 = { ...FILE, hash: 'md5:0123' };
    expect(await downloadAmoFile(md5, { key: KEY, send: answering(new Response(bytes)) })).toEqual(bytes);
  });

  test('says when it cannot be downloaded', async () => {
    const send = answering(new Response('', { status: 403 }));
    await expect(downloadAmoFile(FILE, { key: KEY, send })).rejects.toThrow('failed: 403');
  });
});

describe('differences', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const root of made.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  /**
   * A folder holding the given files.
   * @param files - Their contents, by their paths
   * @returns The folder
   */
  function folder(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-test-'));
    made.push(root);
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    }
    return root;
  }

  const BUILD = { 'manifest.json': '{}', 'chunks/a.js': 'a', 'background.js': 'b' };

  test('finds none between a build and the add-on signed of it, its signature aside', () => {
    const signed = folder({ ...BUILD, 'META-INF/cose.sig': 'sig', 'META-INF/manifest.mf': 'mf' });
    expect(differences(folder(BUILD), signed)).toEqual([]);
  });

  test('names the files that differ, that only the signed add-on has, and that only the build has', () => {
    const signed = folder({ 'manifest.json': '{}', 'chunks/a.js': 'A', 'old.js': 'o', 'META-INF/cose.sig': 'sig' });
    expect(differences(folder(BUILD), signed)).toEqual(['+ old.js', '- background.js', '~ chunks/a.js']);
  });
});
