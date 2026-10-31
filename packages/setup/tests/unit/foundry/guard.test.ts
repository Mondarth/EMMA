import { afterEach, describe, expect, test, vi } from 'vitest';

import type { Guard } from '../../../src/foundry/guard';
import { GUARDED_BUTTONS, GUARDED_CLASS, installGuard } from '../../../src/foundry/guard';
import { installSetupMocks } from '../../mocks/foundry';

let guard: Guard | undefined;

/**
 * Put the guard in place, on or off as a test says.
 * @param on - Whether it starts on
 * @returns The guard, the mocks, a switch, and the refusal callback
 */
function setUp(on = true) {
  const mocks = installSetupMocks();
  const state = { on };
  const onRefused = vi.fn();
  guard = installGuard(mocks.game as never, { isOn: () => state.on, onRefused });
  return { ...mocks, guard, state, onRefused };
}

/**
 * A button of the setup screen, with a handler of Foundry's own.
 * @param action - Its `data-action`
 * @returns The button and the handler
 */
function button(action: string) {
  const element = document.createElement('button');
  element.dataset.action = action;
  element.innerHTML = '<i class="fa-solid fa-rotate"></i>';
  const foundryHandler = vi.fn();
  element.addEventListener('click', foundryHandler);
  document.body.append(element);
  return { element, foundryHandler };
}

afterEach(() => {
  guard?.remove();
  guard = undefined;
  document.body.innerHTML = '';
});

describe('installGuard', () => {
  test.each(GUARDED_BUTTONS)('stops clicks on %s before Foundry sees them, saying why', action => {
    const { onRefused } = setUp();
    const { element, foundryHandler } = button(action);

    element.querySelector('i')?.click();

    expect(foundryHandler).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledOnce();
  });

  test('leaves other buttons alone', () => {
    const { onRefused } = setUp();
    const { element, foundryHandler } = button('worldLaunch');

    element.click();

    expect(foundryHandler).toHaveBeenCalledOnce();
    expect(onRefused).not.toHaveBeenCalled();
  });

  test('leaves clicks alone while it is off', () => {
    const { onRefused } = setUp(false);
    const { element, foundryHandler } = button('installPackage');

    element.click();

    expect(foundryHandler).toHaveBeenCalledOnce();
    expect(onRefused).not.toHaveBeenCalled();
  });

  test('refuses installations sent to the server, letting other requests through', async () => {
    const { game, post, onRefused } = setUp();

    await expect(game.post({ action: 'installPackage', id: 'lib' })).resolves.toEqual({
      error: 'EMMA manages packages on this screen',
    });
    await expect(game.post({ action: 'launchWorld' }, { notify: false })).resolves.toEqual({ ok: true });

    expect(onRefused).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledExactlyOnceWith({ action: 'launchWorld' }, { notify: false });
  });

  test('lets installations through while EMMA makes its own, and refuses them again after', async () => {
    const { guard: placed, game, post, onRefused } = setUp();

    const answer = await placed.allowing(async () => {
      await game.post({ action: 'installPackage', id: 'mondarth-emma' });
      // Nested, as an install inside another.
      await placed.allowing(() => game.post({ action: 'installPackage', id: 'lib-wrapper' }));
      return 'done';
    });
    await expect(placed.allowing(() => Promise.reject(new Error('failed')))).rejects.toThrow('failed');
    await game.post({ action: 'installPackage', id: 'other' });

    expect(answer).toBe('done');
    expect(post).toHaveBeenCalledTimes(2);
    expect(onRefused).toHaveBeenCalledOnce();
  });

  test('lets installations through while it is off', async () => {
    const { game, post } = setUp(false);

    await game.post({ action: 'installPackage' });

    expect(post).toHaveBeenCalledOnce();
  });

  test('greys the buttons out while it is on, and shows a switch when refreshed', () => {
    const { guard: placed, state } = setUp();
    expect(document.body).toHaveClass(GUARDED_CLASS);
    expect(document.head.querySelector('style')?.textContent).toContain('[data-action="updateAll"]');

    state.on = false;
    placed.refresh();

    expect(document.body).not.toHaveClass(GUARDED_CLASS);
  });

  test('removing it gives Foundry everything back', async () => {
    const { guard: placed, game, post } = setUp();
    const { element, foundryHandler } = button('updateAll');

    placed.remove();
    guard = undefined;
    element.click();
    await game.post({ action: 'installPackage' });

    expect(foundryHandler).toHaveBeenCalledOnce();
    expect(game.post).toBe(post);
    expect(document.body).not.toHaveClass(GUARDED_CLASS);
    expect(document.head.querySelector('style')).toBeNull();
  });
});
