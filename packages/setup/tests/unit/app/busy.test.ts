import { describe, expect, test } from 'vitest';

import { BusyState } from '../../../src/app/busy.svelte';

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
    const busy = new BusyState();
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
    const busy = new BusyState();
    const { work, fail } = deferred<number>();

    const running = busy.run('lock:a', 'locking', work);
    fail(new Error('refused'));

    await expect(running).rejects.toThrow('refused');
    expect(busy.activityOf('lock:a')).toBeUndefined();
  });

  test('keeps an item busy until the last of its works is done, with the latest activity', async () => {
    const busy = new BusyState();
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
});
