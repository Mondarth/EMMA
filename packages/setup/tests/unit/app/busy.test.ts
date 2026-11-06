import { afterEach, describe, expect, test, vi } from 'vitest';

import { BusyState, MINIMUM_BUSY_MS, busyTiming } from '../../../src/app/busy.svelte';

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
