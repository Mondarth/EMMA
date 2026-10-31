import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  DEFAULT_LAYOUT,
  GUARD_KEY,
  LAYOUT_KEY,
  readGuardOn,
  readLayout,
  writeGuardOn,
  writeLayout,
} from '../../../src/foundry/preferences';

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

describe("the panels' sizes", () => {
  test('are the defaults until changed, and are kept', () => {
    expect(readLayout()).toEqual(DEFAULT_LAYOUT);

    writeLayout({ tree: 0.3, plan: 0.5 });

    expect(readLayout()).toEqual({ tree: 0.3, plan: 0.5 });
  });

  test('are the defaults for any kept that is not a share', () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ tree: 1.5, plan: 'half' }));
    expect(readLayout()).toEqual(DEFAULT_LAYOUT);

    localStorage.setItem(LAYOUT_KEY, 'null');
    expect(readLayout()).toEqual(DEFAULT_LAYOUT);

    localStorage.setItem(LAYOUT_KEY, '{not json');
    expect(readLayout()).toEqual(DEFAULT_LAYOUT);
  });

  test('are the defaults, and are not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });

    expect(() => {
      writeLayout({ tree: 0.3, plan: 0.5 });
    }).not.toThrow();
    expect(readLayout()).toEqual(DEFAULT_LAYOUT);
  });
});
