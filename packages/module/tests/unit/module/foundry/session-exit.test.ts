import { afterEach, describe, expect, test, vi } from 'vitest';

import { beforeLeavingWorld, EXIT_TARGETS, EXIT_TIMEOUT_MS } from '@module/foundry/session-exit';
import { installFoundryMocks } from '../../mocks/foundry';

/**
 * Register the wrappers around a task, and get the one for a target.
 * @param task - The task
 * @param target - The method wrapped
 * @returns The mocks and the wrapper
 */
function wrap(task: () => Promise<unknown>, target: (typeof EXIT_TARGETS)[number] = 'foundry.Game.prototype.logOut') {
  const mocks = installFoundryMocks();
  beforeLeavingWorld(task);
  const call = mocks.libWrapper.register.mock.calls.find(([, registered]) => registered === target);
  if (call === undefined) throw new Error(`No wrapper for ${target}`);
  return { ...mocks, wrapper: call[2] };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('beforeLeavingWorld', () => {
  test('wraps logging out and returning to setup, always going on to Foundry', () => {
    const { libWrapper } = wrap(() => Promise.resolve());

    expect(libWrapper.register).toHaveBeenCalledTimes(2);
    for (const target of EXIT_TARGETS) {
      expect(libWrapper.register).toHaveBeenCalledWith('mondarth-emma', target, expect.any(Function), 'WRAPPER');
    }
  });

  test.each(EXIT_TARGETS)('%s runs the task, then Foundry, on the same game with the same arguments', async target => {
    const order: string[] = [];
    const { wrapper } = wrap(() => {
      order.push('task');
      return Promise.resolve();
    }, target);
    const self = {};
    const wrapped = vi.fn(function (this: unknown) {
      order.push(this === self ? 'foundry on game' : 'foundry elsewhere');
      return 'left';
    });

    await expect(wrapper.call(self, wrapped, 'argument')).resolves.toBe('left');

    expect(order).toEqual(['task', 'foundry on game']);
    expect(wrapped).toHaveBeenCalledWith('argument');
  });

  test('leaves even when the task fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wrapper } = wrap(() => Promise.reject(new Error('broken')));
    const wrapped = vi.fn();

    await wrapper(wrapped);

    expect(wrapped).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      'mondarth-emma |',
      'Unable to finish the work before leaving the world',
      expect.any(Error),
    );
  });

  test('leaves without the task once it has taken too long', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { wrapper } = wrap(() => new Promise(() => undefined));
    const wrapped = vi.fn();

    const leaving = wrapper(wrapped);
    await vi.advanceTimersByTimeAsync(EXIT_TIMEOUT_MS - 1);
    expect(wrapped).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await leaving;

    expect(wrapped).toHaveBeenCalledOnce();
  });
});
