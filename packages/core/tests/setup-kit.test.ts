import { describe, expect, test } from 'vitest';

import { SETUP_KIT_API, kitFit, kitFlag } from '../src/setup-kit';

describe('kitFit', () => {
  test('fits a kit of the same version, or a newer minor', () => {
    expect(kitFit(SETUP_KIT_API)).toBe('fits');
    expect(kitFit('1.3', '1.2')).toBe('fits');
  });

  test('asks for the module to be updated when the kit gives less than is needed', () => {
    expect(kitFit('1.1', '1.2')).toBe('module-too-old');
    expect(kitFit('1.9', '2.0')).toBe('module-too-old');
  });

  test('asks for the extension to be updated when the kit is of a newer major', () => {
    expect(kitFit('2.0', '1.4')).toBe('extension-too-old');
  });

  test('takes a version it cannot read as a module too old to name one', () => {
    for (const kit of [undefined, 1, '1', 'v1.0', '1.0.0']) expect(kitFit(kit, '1.0')).toBe('module-too-old');
    expect(kitFit('1.0', 'not a version')).toBe('module-too-old');
  });
});

describe('kitFlag', () => {
  test('reads the kit a manifest names', () => {
    expect(kitFlag({ setupKit: { api: '1.0', path: 'dist/emma-setup-kit.js' }, other: true })).toEqual({
      api: '1.0',
      path: 'dist/emma-setup-kit.js',
    });
  });

  test('is none for a manifest that names no kit, or names it wrongly', () => {
    for (const flags of [undefined, null, 'flags', {}, { setupKit: null }, { setupKit: { api: 1, path: 'x.js' } }])
      expect(kitFlag(flags)).toBeUndefined();
    expect(kitFlag({ setupKit: { api: '1.0', path: '' } })).toBeUndefined();
  });
});
