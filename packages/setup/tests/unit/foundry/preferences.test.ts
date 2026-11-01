import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  DEFAULT_LAYOUT,
  GUARD_KEY,
  LAYOUT_KEY,
  PENDING_PLAN_KEY,
  readGuardOn,
  readLayout,
  readPendingPlan,
  writeGuardOn,
  writeLayout,
  writePendingPlan,
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

describe("the plan kept for after Foundry VTT's update", () => {
  const PLAN = { core: '14.369', picks: [['module:midi', '2.0.0']] as const };

  test('is kept, read, and forgotten', () => {
    expect(readPendingPlan()).toBeUndefined();

    expect(writePendingPlan(PLAN)).toBe(true);
    expect(readPendingPlan()).toEqual({ core: '14.369', picks: [['module:midi', '2.0.0']] });

    expect(writePendingPlan(null)).toBe(true);
    expect(localStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
  });

  test.each([
    '{not json',
    '"a plan"',
    JSON.stringify({ core: 14, picks: [] }),
    JSON.stringify({ core: '14.369', picks: 'midi' }),
    JSON.stringify({ core: '14.369', picks: [['module:midi']] }),
    JSON.stringify({ core: '14.369', picks: [['module:midi', 2]] }),
  ])('is not read from %s', kept => {
    localStorage.setItem(PENDING_PLAN_KEY, kept);
    expect(readPendingPlan()).toBeUndefined();
  });

  test('is not kept, nor read, where the storage is refused', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(writePendingPlan(PLAN)).toBe(false);
    expect(writePendingPlan(null)).toBe(false);
    expect(readPendingPlan()).toBeUndefined();
  });
});
