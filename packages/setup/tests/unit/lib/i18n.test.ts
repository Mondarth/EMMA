import { describe, expect, test } from 'vitest';

import { format, localize } from '../../../src/lib/i18n';

describe('localize', () => {
  test('finds a nested key', () => {
    expect(localize('Status.matches')).toBe('Matches its record');
  });

  test.each(['Missing', 'Status.missing', 'Status.matches.more', 'App'])(
    'gives the key %s back if it has no text',
    key => {
      expect(localize(key)).toBe(key);
    },
  );
});

describe('format', () => {
  test('fills in the placeholders, leaving those without a value', () => {
    expect(format('Root.SystemCount', { title: 'D&D 5e', count: 2 })).toBe('D&D 5e: 2');
    expect(format('Root.SystemCount', { title: 'D&D 5e' })).toBe('D&D 5e: {count}');
  });
});
