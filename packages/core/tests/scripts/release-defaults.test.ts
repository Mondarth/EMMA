import { describe, expect, test } from 'vitest';

import {
  EXTENSION_RELEASE_DEFAULTS,
  MODULE_RELEASE_DEFAULTS,
  requireReleaseDefaults,
} from '../../scripts/release-defaults.ts';

const ALL = Object.fromEntries(MODULE_RELEASE_DEFAULTS.map(name => [name, 'set']));

describe('requireReleaseDefaults', () => {
  test("the module's release needs the catalogue's URL and its own key; the extension's the URL and the accounts'", () => {
    expect(MODULE_RELEASE_DEFAULTS).toEqual(['EMMA_DEFAULT_CATALOGUE_URL', 'EMMA_MODULE_CATALOGUE_KEY']);
    expect(EXTENSION_RELEASE_DEFAULTS).toEqual(['EMMA_DEFAULT_CATALOGUE_URL', 'EMMA_ACCOUNTS_URL']);
  });

  test('lets a release with the catalogue go on', () => {
    expect(() => {
      requireReleaseDefaults(ALL, MODULE_RELEASE_DEFAULTS);
    }).not.toThrow();
    expect(() => {
      requireReleaseDefaults(
        { EMMA_DEFAULT_CATALOGUE_URL: 'set', EMMA_ACCOUNTS_URL: 'set' },
        EXTENSION_RELEASE_DEFAULTS,
      );
    }).not.toThrow();
  });

  test('refuses one without them, naming each variable not set, an empty one among them', () => {
    expect(() => {
      requireReleaseDefaults({}, MODULE_RELEASE_DEFAULTS);
    }).toThrow('but EMMA_DEFAULT_CATALOGUE_URL, EMMA_MODULE_CATALOGUE_KEY are not set');
    expect(() => {
      requireReleaseDefaults({ ...ALL, EMMA_MODULE_CATALOGUE_KEY: '' }, MODULE_RELEASE_DEFAULTS);
    }).toThrow('but EMMA_MODULE_CATALOGUE_KEY is not set');
    // An extension without the accounts, which it would sign in at the catalogue with, which signs no one in.
    expect(() => {
      requireReleaseDefaults({ EMMA_DEFAULT_CATALOGUE_URL: 'set' }, EXTENSION_RELEASE_DEFAULTS);
    }).toThrow('but EMMA_ACCOUNTS_URL is not set');
  });

  test('refuses a release built with a development catalogue', () => {
    expect(() => {
      requireReleaseDefaults({ ...ALL, EMMA_DEV_CATALOGUE_URL: 'http://localhost:5173/' }, MODULE_RELEASE_DEFAULTS);
    }).toThrow('unset EMMA_DEV_CATALOGUE_URL');
  });

  test('refuses a release built with development accounts', () => {
    expect(() => {
      requireReleaseDefaults(
        {
          EMMA_DEFAULT_CATALOGUE_URL: 'set',
          EMMA_ACCOUNTS_URL: 'set',
          EMMA_DEV_ACCOUNTS_URL: 'http://localhost:5174/',
        },
        EXTENSION_RELEASE_DEFAULTS,
      );
    }).toThrow('unset EMMA_DEV_ACCOUNTS_URL');
  });
});
