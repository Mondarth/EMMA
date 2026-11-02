import { describe, expect, test } from 'vitest';

import { manifestShape, manifestTypeOf } from '../../../src/lib/manifest-url';

describe('manifestShape', () => {
  test('names a manifest by its ID, title and version', () => {
    expect(manifestShape({ id: 'dice', title: 'Dice', version: '1.0.0' })).toEqual({
      id: 'dice',
      title: 'Dice',
      version: '1.0.0',
    });
    // A title is the ID without one, and a numeric version is read as text.
    expect(manifestShape({ id: 'dice', version: 2 })).toEqual({ id: 'dice', title: 'dice', version: '2' });
  });

  test.each([
    null,
    'text',
    {},
    { id: '', version: '1' },
    { id: 'dice' },
    { id: 'dice', version: true },
    { id: 'dice', version: '' },
  ])('finds no manifest in %j', json => {
    expect(manifestShape(json)).toBeUndefined();
  });
});

describe('manifestTypeOf', () => {
  test.each<[string, unknown, 'module' | 'system' | undefined]>([
    ['https://example.org/dice/module.json', {}, 'module'],
    ['https://example.org/dice/releases/latest/download/Module.json', {}, 'module'],
    ['https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/system.pf2e.json', {}, 'system'],
    // Only a system's fields tell, without a file name that does.
    ['https://example.org/manifest.json', { id: 'x', initiative: '1d20' }, 'system'],
    ['https://example.org/manifest.json', { id: 'x' }, undefined],
    ['https://example.org/systems.json', null, undefined],
    ['not a url', { gridDistance: 5 }, 'system'],
  ])('reads %s as %s', (url, json, type) => {
    expect(manifestTypeOf(url, json)).toBe(type);
  });
});
