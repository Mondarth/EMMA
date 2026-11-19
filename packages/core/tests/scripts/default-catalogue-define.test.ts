import { describe, expect, test } from 'vitest';

import { catalogueUrlDefine, defaultCatalogueDefine } from '../../scripts/default-catalogue-define.ts';
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
      EMMA_MODULE_CATALOGUE_KEY: KEY,
    });
    const parsed = JSON.parse(define) as { url: Obscured; key: Obscured };

    expect(reveal(parsed.url)).toBe(CATALOGUE_URL);
    expect(reveal(parsed.key)).toBe(KEY);
    expect(define).not.toContain(KEY);
    expect(define).not.toContain('catalogue.example.test');
  });

  test('refuses half a catalogue, which a release must never ship', () => {
    expect(() => defaultCatalogueDefine({ EMMA_DEFAULT_CATALOGUE_URL: CATALOGUE_URL })).toThrow(
      /EMMA_MODULE_CATALOGUE_KEY/,
    );
    expect(() => defaultCatalogueDefine({ EMMA_MODULE_CATALOGUE_KEY: KEY })).toThrow(/EMMA_DEFAULT_CATALOGUE_URL/);
  });

  test('refuses a catalogue URL that is not https, or not a URL', () => {
    for (const url of ['http://catalogue.example.test/', 'catalogue.example.test'])
      expect(() => defaultCatalogueDefine({ EMMA_DEFAULT_CATALOGUE_URL: url, EMMA_MODULE_CATALOGUE_KEY: KEY })).toThrow(
        /EMMA_DEFAULT_CATALOGUE_URL/,
      );
  });
});

describe('catalogueUrlDefine', () => {
  test("gives the EMMA extension the catalogue's URL alone, or none", () => {
    expect(catalogueUrlDefine({})).toBe('null');
    expect(JSON.parse(catalogueUrlDefine({ EMMA_DEFAULT_CATALOGUE_URL: CATALOGUE_URL }))).toBe(CATALOGUE_URL);
    // A key set for the module's build is never taken into the extension's.
    expect(
      catalogueUrlDefine({ EMMA_DEFAULT_CATALOGUE_URL: CATALOGUE_URL, EMMA_MODULE_CATALOGUE_KEY: KEY }),
    ).not.toContain(KEY);
  });

  test('refuses a catalogue URL that is not https', () => {
    expect(() => catalogueUrlDefine({ EMMA_DEFAULT_CATALOGUE_URL: 'http://catalogue.example.test/' })).toThrow(
      /EMMA_DEFAULT_CATALOGUE_URL/,
    );
  });

  test("takes a development catalogue's URL in place of the release's, http or https", () => {
    for (const url of ['http://localhost:5173/', 'http://foundrymoddev1:5173/', 'https://dev.example.test/']) {
      expect(
        JSON.parse(catalogueUrlDefine({ EMMA_DEV_CATALOGUE_URL: url, EMMA_DEFAULT_CATALOGUE_URL: CATALOGUE_URL })),
      ).toBe(url);
    }
    for (const url of ['ftp://localhost/', 'localhost:5173']) {
      expect(() => catalogueUrlDefine({ EMMA_DEV_CATALOGUE_URL: url })).toThrow(/EMMA_DEV_CATALOGUE_URL/);
    }
  });
});
