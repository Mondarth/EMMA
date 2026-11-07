import { afterEach, describe, expect, test, vi } from 'vitest';

import { BusyState, MINIMUM_BUSY_MS, afterPaint, busyTiming, paced } from '../../../src/app/busy.svelte';

/**
 * Work that finishes when told to.
 * @returns The work, and how to finish it
 */
function deferred<T>() {
  let finish: (value: T) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const work = new Promise<T>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { work: () => work, finish, fail };
}

describe('BusyState', () => {
  test('marks an item busy with an activity while its work runs, and gives what the work gives', async () => {
    const busy = new BusyState(0);
    const { work, finish } = deferred<number>();
    expect(busy.activityOf('tree:a')).toBeUndefined();

    const running = busy.run('tree:a', 'planning', work);
    expect(busy.activityOf('tree:a')).toBe('planning');
    expect(busy.activityOf('tree:b')).toBeUndefined();
    finish(7);

    await expect(running).resolves.toBe(7);
    expect(busy.activityOf('tree:a')).toBeUndefined();
  });

  test('clears an item once its work fails, passing the failure on', async () => {
    const busy = new BusyState(0);
    const { work, fail } = deferred<number>();

    const running = busy.run('lock:a', 'locking', work);
    fail(new Error('refused'));

    await expect(running).rejects.toThrow('refused');
    expect(busy.activityOf('lock:a')).toBeUndefined();
  });

  test('keeps an item busy until the last of its works is done, with the latest activity', async () => {
    const busy = new BusyState(0);
    const first = deferred<undefined>();
    const second = deferred<undefined>();

    const one = busy.run('plan:a', 'planning', first.work);
    const two = busy.run('plan:a', 'reading', second.work);
    expect(busy.activityOf('plan:a')).toBe('reading');
    first.finish(undefined);
    await one;
    expect(busy.activityOf('plan:a')).toBe('reading');
    second.finish(undefined);
    await two;
    expect(busy.activityOf('plan:a')).toBeUndefined();
  });

  describe('marking an item for the least time', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    test('keeps work done within a frame marked long enough to be seen, giving its value at once', async () => {
      vi.useFakeTimers();
      const busy = new BusyState(MINIMUM_BUSY_MS);

      await expect(busy.run('tree:a', 'planning', () => Promise.resolve(3))).resolves.toBe(3);

      expect(busy.activityOf('tree:a')).toBe('planning');
      vi.advanceTimersByTime(MINIMUM_BUSY_MS - 1);
      expect(busy.activityOf('tree:a')).toBe('planning');
      vi.advanceTimersByTime(1);
      expect(busy.activityOf('tree:a')).toBeUndefined();
    });

    test('is as long as the timing says, unless a state is given its own', async () => {
      vi.useFakeTimers();
      const before = busyTiming.minimumMs;
      busyTiming.minimumMs = 100;
      try {
        const busy = new BusyState();
        await busy.run('tree:a', 'planning', () => Promise.resolve());
        vi.advanceTimersByTime(99);
        expect(busy.activityOf('tree:a')).toBe('planning');
        vi.advanceTimersByTime(1);
        expect(busy.activityOf('tree:a')).toBeUndefined();
      } finally {
        busyTiming.minimumMs = before;
      }
    });

    test('clears work that took longer at once', async () => {
      vi.useFakeTimers();
      const busy = new BusyState(MINIMUM_BUSY_MS);
      let finish = () => {};
      const running = busy.run(
        'lock:a',
        'locking',
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          }),
      );

      vi.advanceTimersByTime(MINIMUM_BUSY_MS);
      finish();
      await running;

      expect(busy.activityOf('lock:a')).toBeUndefined();
    });
  });
});

describe('letting the browser draw', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('waits for a frame to be drawn, and then for the task after it', async () => {
    vi.useFakeTimers();
    let drawn = false;
    const waiting = afterPaint().then(() => (drawn = true));

    await vi.advanceTimersByTimeAsync(0);
    expect(drawn).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    await waiting;
    expect(drawn).toBe(true);
  });

  test('paces long work: on at once within a frame, and waiting for a frame once past it', async () => {
    vi.useFakeTimers();
    const pace = paced();
    let passed = false;

    await pace();
    vi.setSystemTime(Date.now() + 60);
    const waiting = pace().then(() => (passed = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(passed).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    await waiting;
    expect(passed).toBe(true);
    // Its budget starts again once it has let the browser draw.
    await pace();
  });
});

describe('marking an item busy', () => {
  afterEach(() => {
    busyTiming.paint = false;
    vi.useRealTimers();
  });

  // Regression: the mark on Plan the best versions never showed, as the planner's answers, settling at once, kept the
  // browser from drawing it until the work was done. Every item's work now starts once its mark is drawn.
  test('starts the work only once the browser has drawn the mark', async () => {
    busyTiming.paint = true;
    vi.useFakeTimers();
    const busy = new BusyState(0);
    const work = vi.fn(() => Promise.resolve('planned'));

    const running = busy.run('best', 'planning', work);
    expect(busy.activityOf('best')).toBe('planning');
    await vi.advanceTimersByTimeAsync(0);
    expect(work).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await expect(running).resolves.toBe('planned');
    expect(work).toHaveBeenCalledOnce();
  });
});
