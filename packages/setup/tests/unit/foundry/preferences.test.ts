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
  NOTES_KEY,
  readNotes,
  writeNotes,
  OWNED_FOR_MS,
  OWNED_KEY,
  readOwnedKept,
  writeOwnedKept,
  readCoreLocked,
  PINS_KEY,
  readPins,
  writePins,
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

describe("the user's notes", () => {
  test('are none until one is written, and are kept, as none once all go', () => {
    expect(readNotes()).toEqual({});
    writeNotes({ 'ignore:module:a': 'Its manifest is wrong' });
    expect(readNotes()).toEqual({ 'ignore:module:a': 'Its manifest is wrong' });
    writeNotes({});
    expect(localStorage.getItem(NOTES_KEY)).toBeNull();
  });

  test('are none when what is kept is not notes, and keep only the notes that are text', () => {
    localStorage.setItem(NOTES_KEY, '["a"]');
    expect(readNotes()).toEqual({});
    localStorage.setItem(NOTES_KEY, 'null');
    expect(readNotes()).toEqual({});
    localStorage.setItem(NOTES_KEY, 'not json');
    expect(readNotes()).toEqual({});
    localStorage.setItem(NOTES_KEY, '{"lock:core":"Stay on 13","pin:module:a":2,"ignore:world:b":""}');
    expect(readNotes()).toEqual({ 'lock:core': 'Stay on 13' });
  });

  test('are none, and are not kept, when the storage refuses', () => {
    const blocked = () => {
      throw new DOMException('Access denied', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(readNotes()).toEqual({});
    expect(() => {
      writeNotes({ 'lock:core': 'x' });
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

describe('the plan a run has not finished', () => {
  const PLAN = { core: '14.369', picks: [['module:midi', '2.0.0']] as const };

  test('is kept, read, and forgotten', () => {
    expect(readPendingPlan()).toBeUndefined();

    expect(writePendingPlan(PLAN)).toBe(true);
    expect(readPendingPlan()).toEqual({ core: '14.369', picks: [['module:midi', '2.0.0']] });

    expect(writePendingPlan(null)).toBe(true);
    expect(localStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
  });

  test('is read without a build, as when the run did not stop before updating Foundry VTT', () => {
    expect(writePendingPlan({ picks: PLAN.picks })).toBe(true);
    expect(readPendingPlan()).toEqual({ picks: [['module:midi', '2.0.0']] });
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

describe('the premium packages the user owns', () => {
  const NOW = 1_800_000_000_000;

  test('are kept for each type, and read for a week', () => {
    expect(readOwnedKept('module', NOW)).toBeUndefined();

    writeOwnedKept('module', new Set(['module:dice']), NOW);

    expect(readOwnedKept('module', NOW)).toEqual(new Set(['module:dice']));
    expect(readOwnedKept('module', NOW + OWNED_FOR_MS - 1)).toEqual(new Set(['module:dice']));
    expect(readOwnedKept('module', NOW + OWNED_FOR_MS)).toBeUndefined();
    // Kept in the future, as by a clock set wrong, they are read again.
    expect(readOwnedKept('module', NOW - 1)).toBeUndefined();
    expect(readOwnedKept('system', NOW)).toBeUndefined();
  });

  test.each([
    '{not json',
    '"owned"',
    JSON.stringify({ at: 'now', keys: [] }),
    JSON.stringify({ at: NOW, keys: 'module:dice' }),
    JSON.stringify({ at: NOW, keys: [7] }),
  ])('are not read from %s', kept => {
    localStorage.setItem(`${OWNED_KEY}.module`, kept);
    expect(readOwnedKept('module', NOW)).toBeUndefined();
  });

  test('are not kept, nor read, where the storage is refused', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(() => {
      writeOwnedKept('module', new Set(['module:dice']));
    }).not.toThrow();
    expect(readOwnedKept('module')).toBeUndefined();
  });
});

describe('pins', () => {
  test('are none until kept, then as kept, and none again once all are cleared', () => {
    expect(readPins()).toEqual({});
    writePins({ 'module:app': '1.5.0', core: '14.368' });
    expect(readPins()).toEqual({ 'module:app': '1.5.0', core: '14.368' });
    writePins({});
    expect(localStorage.getItem(PINS_KEY)).toBeNull();
  });

  test('are none where what is kept is not pins, and a version that is not text is left out', () => {
    for (const kept of ['not json', '[]', 'null', '"text"']) {
      localStorage.setItem(PINS_KEY, kept);
      expect(readPins()).toEqual({});
    }
    localStorage.setItem(PINS_KEY, JSON.stringify({ 'module:app': '1.0.0', 'module:odd': 2 }));
    expect(readPins()).toEqual({ 'module:app': '1.0.0' });
  });

  test('are kept for the visit alone where the storage cannot be written', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => {
      writePins({ 'module:app': '1.0.0' });
    }).not.toThrow();
    set.mockRestore();
  });
});
