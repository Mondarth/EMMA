import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  BEST_IN_USE_KEY,
  readBestInUseOnly,
  writeBestInUseOnly,
  ALPHA_ACKNOWLEDGED_KEY,
  readAlphaAcknowledged,
  writeAlphaAcknowledged,
  DEFAULT_LAYOUT,
  GUARD_KEY,
  LAYOUT_KEY,
  PENDING_PLAN_KEY,
  CORE_LOCK_KEY,
  IGNORED_KEY,
  readCoreLocked,
  readIgnored,
  readGuardOn,
  readLayout,
  readPendingPlan,
  writeCoreLocked,
  writeIgnored,
  writeGuardOn,
  writeLayout,
  writePendingPlan,
} from '../../../src/foundry/preferences';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("EMMA's lock of Foundry VTT", () => {
  test('is off until switched on, and is kept', () => {
    expect(readCoreLocked()).toBe(false);

    writeCoreLocked(true);
    expect(localStorage.getItem(CORE_LOCK_KEY)).toBe('locked');
    expect(readCoreLocked()).toBe(true);

    writeCoreLocked(false);
    expect(localStorage.getItem(CORE_LOCK_KEY)).toBeNull();
    expect(readCoreLocked()).toBe(false);
  });

  test('is off, and is not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(readCoreLocked()).toBe(false);
    expect(() => {
      writeCoreLocked(true);
    }).not.toThrow();
  });
});

describe('acknowledging the alpha', () => {
  test('is for one version: a new one asks again', () => {
    expect(readAlphaAcknowledged('0.1.1')).toBe(false);

    writeAlphaAcknowledged('0.1.1');
    expect(localStorage.getItem(ALPHA_ACKNOWLEDGED_KEY)).toBe('0.1.1');
    expect(readAlphaAcknowledged('0.1.1')).toBe(true);
    expect(readAlphaAcknowledged('0.2.0')).toBe(false);
  });

  test('is not, and is not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(readAlphaAcknowledged('0.1.1')).toBe(false);
    expect(() => {
      writeAlphaAcknowledged('0.1.1');
    }).not.toThrow();
  });
});

describe('limiting the best versions to what worlds use', () => {
  test('is off until switched on, and is kept', () => {
    expect(readBestInUseOnly()).toBe(false);

    writeBestInUseOnly(true);
    expect(localStorage.getItem(BEST_IN_USE_KEY)).toBe('on');
    expect(readBestInUseOnly()).toBe(true);

    writeBestInUseOnly(false);
    expect(localStorage.getItem(BEST_IN_USE_KEY)).toBeNull();
  });

  test('is off, and is not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(readBestInUseOnly()).toBe(false);
    expect(() => {
      writeBestInUseOnly(true);
    }).not.toThrow();
  });
});

describe('what EMMA ignores', () => {
  test('is nothing until something is ignored, and is kept, in order', () => {
    expect(readIgnored()).toEqual([]);

    writeIgnored('world:b', true);
    writeIgnored('module:a', true);
    writeIgnored('module:a', true);
    expect(localStorage.getItem(IGNORED_KEY)).toBe('["module:a","world:b"]');
    expect(readIgnored()).toEqual(['module:a', 'world:b']);

    writeIgnored('module:a', false);
    expect(readIgnored()).toEqual(['world:b']);
    writeIgnored('world:b', false);
    expect(localStorage.getItem(IGNORED_KEY)).toBeNull();
  });

  test('is nothing when what is kept is not a list of keys, and keeps only the keys of one', () => {
    localStorage.setItem(IGNORED_KEY, '{"a":1}');
    expect(readIgnored()).toEqual([]);
    localStorage.setItem(IGNORED_KEY, 'not json');
    expect(readIgnored()).toEqual([]);
    localStorage.setItem(IGNORED_KEY, '["module:a",2]');
    expect(readIgnored()).toEqual(['module:a']);
  });

  test('is nothing, and is not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(readIgnored()).toEqual([]);
    expect(() => {
      writeIgnored('module:a', true);
    }).not.toThrow();
  });
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
