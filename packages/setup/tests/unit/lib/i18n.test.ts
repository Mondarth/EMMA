import { describe, expect, test } from 'vitest';

import { format, formatSize, localize } from '../../../src/lib/i18n';

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

describe('formatSize', () => {
  test.each([
    [512, '512 byte'],
    [1_500, '1.5 kB'],
    [42_000_000, '42 MB'],
    [3_210_000_000, '3.2 GB'],
    [7_000_000_000_000_000, '7,000 TB'],
  ])('gives %d bytes as %s', (bytes, words) => {
    expect(formatSize(bytes)).toBe(words);
  });
});
