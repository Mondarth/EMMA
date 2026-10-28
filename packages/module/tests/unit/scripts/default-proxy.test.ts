import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { reveal } from '@module/lib/obscure';
import type { Obscured } from '@module/lib/obscure';
import { defaultProxyDefine, filesHolding } from '../../../scripts/build/default-proxy';

const PROXY_URL = 'https://packages.example.test/?url={url}';
const KEY = 'k3y-0123456789abcdef';

describe('defaultProxyDefine', () => {
  test('gives no default proxy without one set, as for development and CI builds', () => {
    expect(defaultProxyDefine({})).toBe('null');
  });

  test('gives the proxy set, obscured, never in plain text', () => {
    const define = defaultProxyDefine({ EMMA_DEFAULT_PROXY_URL: PROXY_URL, EMMA_DEFAULT_PROXY_KEY: KEY });
    const parsed = JSON.parse(define) as { url: Obscured; key: Obscured };

    expect(reveal(parsed.url)).toBe(PROXY_URL);
    expect(reveal(parsed.key)).toBe(KEY);
    expect(define).not.toContain(KEY);
    expect(define).not.toContain('packages.example.test');
  });

  test('refuses half a proxy, which a release must never ship', () => {
    expect(() => defaultProxyDefine({ EMMA_DEFAULT_PROXY_URL: PROXY_URL })).toThrow(/EMMA_DEFAULT_PROXY_KEY/);
    expect(() => defaultProxyDefine({ EMMA_DEFAULT_PROXY_KEY: KEY })).toThrow(/EMMA_DEFAULT_PROXY_URL/);
  });

  test('refuses a proxy URL that is not https, or has nowhere to put the URL', () => {
    for (const url of ['http://packages.example.test/?url={url}', 'https://packages.example.test/'])
      expect(() => defaultProxyDefine({ EMMA_DEFAULT_PROXY_URL: url, EMMA_DEFAULT_PROXY_KEY: KEY })).toThrow(
        /EMMA_DEFAULT_PROXY_URL/,
      );
  });
});

describe('filesHolding', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  test('names the built files that hold a secret in plain text, so a release can refuse to ship them', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-dist-'));
    fs.mkdirSync(path.join(dir, 'lang'));
    fs.writeFileSync(path.join(dir, 'mondarth-emma.js'), `const key = "${KEY}";`);
    fs.writeFileSync(path.join(dir, 'mondarth-emma.js.map'), '{"mappings":""}');
    fs.writeFileSync(path.join(dir, 'lang', 'en.json'), `{"leak":"${KEY}"}`);

    expect(
      filesHolding(dir, KEY)
        .map(file => path.relative(dir as string, file))
        .sort(),
    ).toEqual([path.join('lang', 'en.json'), 'mondarth-emma.js']);
    expect(filesHolding(dir, 'not-there')).toEqual([]);
  });
});
