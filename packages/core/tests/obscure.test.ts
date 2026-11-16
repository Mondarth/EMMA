import { describe, expect, test } from 'vitest';

import { obscure, reveal } from '../src/obscure';

const KEY = 'k3y-0123456789abcdef-0123456789abcdef';

// This package is compiled without the browser's declarations, but the tests run where it has them.
const web = globalThis as unknown as { btoa(text: string): string };

/**
 * The longest run of the text's characters to be found, in order, anywhere in what it was obscured as.
 * @param text - The text
 * @param obscured - What it was obscured as, as JSON
 * @returns The length of the longest run
 */
function longestRunIn(text: string, obscured: string): number {
  let longest = 0;
  for (let start = 0; start < text.length; start++)
    for (let end = start + longest + 1; end <= text.length && obscured.includes(text.slice(start, end)); end++)
      longest = end - start;
  return longest;
}

describe('obscure', () => {
  test('is revealed as the text it was given', () => {
    for (const text of [KEY, 'https://packages.example.test/?url={url}', 'ünïcødé ✓', 'a'])
      expect(reveal(obscure(text))).toBe(text);
  });

  test('leaves no run of the text in what it gives, nor as base64', () => {
    const obscured = JSON.stringify(obscure(KEY));

    // Digits are in the bytes by chance; no run of the key longer than a couple of them is.
    expect(longestRunIn(KEY, obscured)).toBeLessThanOrEqual(3);
    expect(obscured).not.toContain(web.btoa(KEY).slice(0, 8));
  });

  test('splits the text into chunks, each masked by a pad of its own', () => {
    const obscured = obscure(KEY);

    expect(obscured.length).toBe(4);
    expect(obscured.map(([pad, masked]) => pad.length === masked.length)).toEqual([true, true, true, true]);
    expect(obscured.reduce((total, [, masked]) => total + masked.length, 0)).toBe(KEY.length);
  });

  // So that building a release twice gives the same bundle, which a release signed again relies on.
  test('masks a text the same way each time', () => {
    expect(JSON.stringify(obscure(KEY))).toBe(JSON.stringify(obscure(KEY)));
  });

  test('masks each chunk, and each text, with a pad of its own', () => {
    const pads = obscure(KEY).map(([pad]) => JSON.stringify(pad));
    expect(new Set(pads).size).toBe(pads.length);
    const other = KEY.replace('k3y', 'k4y');
    expect(JSON.stringify(obscure(other)[0]?.[0])).not.toBe(pads[0]);
  });

  test('gives as many chunks as the text has bytes when it is short', () => {
    expect(obscure('ab')).toHaveLength(2);
  });
});
