import { describe, expect, test } from 'vitest';

import { RELEASE_DEFAULTS, requireReleaseDefaults } from '../../scripts/release-defaults.ts';

const ALL = Object.fromEntries(RELEASE_DEFAULTS.map(name => [name, 'set']));

describe('requireReleaseDefaults', () => {
  test('lets a release with the catalogue and the proxy go on', () => {
    expect(() => {
      requireReleaseDefaults(ALL);
    }).not.toThrow();
  });

  test('refuses one without them, naming each variable not set, an empty one among them', () => {
    expect(() => {
      requireReleaseDefaults({});
    }).toThrow(
      'but EMMA_DEFAULT_CATALOGUE_URL, EMMA_DEFAULT_CATALOGUE_KEY, EMMA_DEFAULT_PROXY_URL, EMMA_DEFAULT_PROXY_KEY are not set',
    );
    expect(() => {
      requireReleaseDefaults({ ...ALL, EMMA_DEFAULT_PROXY_KEY: '' });
    }).toThrow('but EMMA_DEFAULT_PROXY_KEY is not set');
  });
});
