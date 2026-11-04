import { afterEach, describe, expect, test, vi } from 'vitest';

import type { Guard } from '../../../src/foundry/guard';
import { GUARDED_BUTTONS, GUARDED_CLASS, REFUSAL, installGuard } from '../../../src/foundry/guard';
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

describe("installGuard, for Foundry's package menu", () => {
  /**
   * A package's row in Foundry's list of its type, and the package menu open for it, as Foundry 14.368 renders them,
   * with a handler of Foundry's own on each item.
   * @param type - The list's type
   * @returns The row, the items by icon, and Foundry's handler
   */
  function menuFor(type: string) {
    const list = document.createElement('section');
    list.dataset.packageType = type;
    const row = document.createElement('li');
    row.className = 'package';
    row.dataset.packageId = 'midi-qol';
    row.innerHTML = '<span class="package-title">Midi</span>';
    list.append(row);
    const menu = document.createElement('menu');
    menu.className = 'context-items';
    menu.innerHTML = ['fa-star', 'fa-lock', 'fa-unlock', 'fa-trash']
      .map(icon => `<li class="context-item"><i class="fa-solid ${icon}"></i><span>${icon}</span></li>`)
      .join('');
    document.body.append(list, menu);
    const foundryHandler = vi.fn();
    menu.addEventListener('click', foundryHandler);
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const item = (icon: string) => menu.querySelector(`.${icon}`)?.closest('li') ?? menu;
    return { item, foundryHandler };
  }

  test.each(['module', 'system'])("stops Lock and Unlock in a %s's menu, leaving its other items alone", type => {
    const { onRefused } = setUp();
    const { item, foundryHandler } = menuFor(type);

    item('fa-lock').click();
    item('fa-unlock').querySelector('span')?.click();
    expect(foundryHandler).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledTimes(2);

    item('fa-star').click();
    expect(foundryHandler).toHaveBeenCalledOnce();
  });

  test("leaves a world's menu alone, and every menu while it is off", () => {
    const { state, onRefused } = setUp();
    const world = menuFor('world');
    world.item('fa-lock').click();
    expect(world.foundryHandler).toHaveBeenCalledOnce();

    state.on = false;
    const midi = menuFor('module');
    midi.item('fa-lock').click();
    expect(midi.foundryHandler).toHaveBeenCalledOnce();
    expect(onRefused).not.toHaveBeenCalled();
  });

  test("refuses Foundry's uninstall of a game system or module before it asks, but not of a world", async () => {
    const mocks = installSetupMocks();
    const uninstall = vi.fn(() => Promise.resolve());
    Object.assign(mocks.game, { uninstallPackage: uninstall });
    const state = { on: true };
    const onRefused = vi.fn();
    guard = installGuard(mocks.game as never, { isOn: () => state.on, onRefused });
    const game = mocks.game as unknown as { uninstallPackage: (pkg: object) => Promise<unknown> };

    await game.uninstallPackage({ type: 'module', id: 'midi-qol' });
    await game.uninstallPackage({ type: 'system', id: 'dnd5e' });
    expect(uninstall).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledTimes(2);

    await game.uninstallPackage({ type: 'world', id: 'neme' });
    state.on = false;
    await game.uninstallPackage({ type: 'module', id: 'midi-qol' });
    expect(uninstall).toHaveBeenCalledTimes(2);

    guard.remove();
    guard = undefined;
    expect(game.uninstallPackage).toBe(uninstall);
  });

  test("refuses uninstalling, locking and unlocking a game system or module sent to the server, but not EMMA's own", async () => {
    const { game, onRefused, guard: placed } = setUp();
    const post = game.post as unknown as (request: object) => Promise<unknown>;

    await expect(post({ action: 'uninstallPackage', type: 'module', id: 'midi-qol' })).rejects.toThrow(REFUSAL);
    await expect(post({ action: 'lockPackage', type: 'system', id: 'dnd5e', shouldLock: true })).rejects.toThrow(
      REFUSAL,
    );
    expect(onRefused).toHaveBeenCalledTimes(2);

    await expect(post({ action: 'lockPackage', type: 'world', id: 'neme', shouldLock: true })).resolves.not.toThrow();
    await expect(
      placed.allowing(() => post({ action: 'lockPackage', type: 'module', id: 'midi-qol', shouldLock: true })),
    ).resolves.not.toThrow();
    expect(onRefused).toHaveBeenCalledTimes(2);
  });
});
