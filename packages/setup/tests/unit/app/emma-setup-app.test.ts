import { screen } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { APP_ID, closeEmmaSetup, openEmmaSetup } from '../../../src/app/emma-setup-app';
import { GEOMETRY_KEY } from '../../../src/foundry/preferences';
import { SetupState } from '../../../src/app/setup-state.svelte';
import { buildOverview } from '../../../src/lib/overview';
import { installation, noInstall, noUpdates } from '../../mocks/fixtures';

/**
 * What the window shows: an installation with nothing in it.
 * @returns The state, with its reading spied on
 */
function setUp() {
  const load = vi.fn(() => Promise.resolve(buildOverview(installation(), new Map())));
  return {
    setup: new SetupState({
      load,
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
    }),
    load,
  };
}

afterEach(async () => {
  await closeEmmaSetup();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('openEmmaSetup', () => {
  test('opens the window, reading the installation, and brings it to the front if it is open', async () => {
    const { setup, load } = setUp();

    const app = await openEmmaSetup(setup);
    expect(document.getElementById(APP_ID)).not.toBeNull();
    expect(await screen.findByRole('tree', { name: 'Installation' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();

    await expect(openEmmaSetup(setup)).resolves.toBe(app);
    expect(app.bringToFront).toHaveBeenCalledOnce();

    await app.render();
    expect(load).toHaveBeenCalledOnce();
  });

  test('closes the window, and does nothing when none is open', async () => {
    const { setup } = setUp();
    await openEmmaSetup(setup);

    await closeEmmaSetup();
    expect(document.getElementById(APP_ID)).toBeNull();

    await expect(closeEmmaSetup()).resolves.toBeUndefined();
  });

  test('unmounts the component when the window closes, and opens afresh', async () => {
    const { setup, load } = setUp();
    const app = await openEmmaSetup(setup);
    await screen.findByRole('tree');

    await app.close();
    expect(screen.queryByRole('tree')).toBeNull();

    const reopened = await openEmmaSetup(setup);
    expect(reopened).not.toBe(app);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("the window's place and size", () => {
  test('are kept as it moves and is resized, and it opens where it was left', async () => {
    const first = await openEmmaSetup(setUp().setup);
    expect(first.options).toHaveProperty('position', { width: 820, height: 600 });

    first.setPosition({ left: 40, top: 30, width: 900, height: 640 });
    first.setPosition({ left: 60 });

    expect(JSON.parse(localStorage.getItem(GEOMETRY_KEY) ?? 'null')).toEqual({
      left: 60,
      top: 30,
      width: 900,
      height: 640,
    });
    await closeEmmaSetup();
    const again = await openEmmaSetup(setUp().setup);
    expect(again.options).toHaveProperty('position', { left: 60, top: 30, width: 900, height: 640 });
  });

  test('are not kept while it is minimised, nor a size Foundry leaves to its content', async () => {
    const app = await openEmmaSetup(setUp().setup);
    app.setPosition({ left: 40, top: 30, width: 900, height: 640 });

    Reflect.set(app, 'minimized', true);
    app.setPosition({ height: 30 });
    Reflect.set(app, 'minimized', false);
    app.setPosition({ height: 'auto' });

    expect(JSON.parse(localStorage.getItem(GEOMETRY_KEY) ?? 'null')).toEqual({
      left: 40,
      top: 30,
      width: 900,
      height: 640,
    });
  });

  test.each([
    'not json',
    JSON.stringify({ left: 1, top: 2, width: 0, height: 5 }),
    JSON.stringify({ left: 1, top: 2, width: 3 }),
    JSON.stringify('text'),
  ])('opens at its default place and size when what was kept is %s', async kept => {
    localStorage.setItem(GEOMETRY_KEY, kept);

    const app = await openEmmaSetup(setUp().setup);

    expect(app.options).toHaveProperty('position', { width: 820, height: 600 });
  });
});
