import { describe, expect, test } from 'vitest';

import { defaultCatalogueDefine } from '../../scripts/default-catalogue-define.ts';
import type { Obscured } from '../../src/obscure.ts';
import { reveal } from '../../src/obscure.ts';

const CATALOGUE_URL = 'https://catalogue.example.test/';
const KEY = 'k3y-0123456789abcdef';

describe('defaultCatalogueDefine', () => {
  test('gives no default catalogue without one set, as for development and CI builds', () => {
    expect(defaultCatalogueDefine({})).toBe('null');
  });

  test('gives the catalogue set, obscured, never in plain text', () => {
    const define = defaultCatalogueDefine({
      EMMA_DEFAULT_CATALOGUE_URL: CATALOGUE_URL,
      EMMA_DEFAULT_CATALOGUE_KEY: KEY,
    });
    const parsed = JSON.parse(define) as { url: Obscured; key: Obscured };

    expect(reveal(parsed.url)).toBe(CATALOGUE_URL);
    expect(reveal(parsed.key)).toBe(KEY);
    expect(define).not.toContain(KEY);
    expect(define).not.toContain('catalogue.example.test');
  });

  test('refuses half a catalogue, which a release must never ship', () => {
    expect(() => defaultCatalogueDefine({ EMMA_DEFAULT_CATALOGUE_URL: CATALOGUE_URL })).toThrow(
      /EMMA_DEFAULT_CATALOGUE_KEY/,
    );
    expect(() => defaultCatalogueDefine({ EMMA_DEFAULT_CATALOGUE_KEY: KEY })).toThrow(/EMMA_DEFAULT_CATALOGUE_URL/);
  });

  test('refuses a catalogue URL that is not https, or not a URL', () => {
    for (const url of ['http://catalogue.example.test/', 'catalogue.example.test'])
      expect(() =>
        defaultCatalogueDefine({ EMMA_DEFAULT_CATALOGUE_URL: url, EMMA_DEFAULT_CATALOGUE_KEY: KEY }),
      ).toThrow(/EMMA_DEFAULT_CATALOGUE_URL/);
  });
});
