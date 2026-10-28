import { afterEach, describe, expect, test, vi } from 'vitest';

import { GUARD_KEY, readGuardOn, writeGuardOn } from '../../../src/foundry/preferences';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the guard setting', () => {
  test('is on until switched off, and is kept', () => {
    expect(readGuardOn()).toBe(true);

    writeGuardOn(false);
    expect(localStorage.getItem(GUARD_KEY)).toBe('off');
    expect(readGuardOn()).toBe(false);

    writeGuardOn(true);
    expect(readGuardOn()).toBe(true);
  });

  test('is on, and is not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });

    expect(() => {
      writeGuardOn(false);
    }).not.toThrow();
    expect(readGuardOn()).toBe(true);
  });
});
