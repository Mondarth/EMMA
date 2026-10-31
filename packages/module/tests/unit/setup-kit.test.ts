import { describe, expect, test } from 'vitest';

import { SETUP_KIT_API, kitFlag } from '@mondarth/emma-core/setup-kit';

import moduleJSON from '../../module.json' with { type: 'json' };
import kit from '../../src/setup-kit';

describe('the setup kit', () => {
  test('is of the API version this build has', () => {
    expect(kit.api).toBe(SETUP_KIT_API);
  });

  test('gives the resolver and its sources', () => {
    expect(kit.resolver.packageKey({ type: 'module', id: 'lib' })).toBe('module:lib');
    expect(typeof kit.sources.sourceSet).toBe('function');
  });

  test('is named in the manifest at its version and where the build puts it', () => {
    expect(kitFlag(moduleJSON.flags)).toEqual({ api: SETUP_KIT_API, path: 'dist/emma-setup-kit.js' });
  });
});
