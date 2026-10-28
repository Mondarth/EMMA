import { screen } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { APP_ID, closeEmmaSetup, openEmmaSetup } from '../../../src/app/emma-setup-app';
import { SetupState } from '../../../src/app/setup-state.svelte';
import { buildOverview } from '../../../src/lib/overview';
import { installation } from '../../mocks/fixtures';

/**
 * What the window shows: an installation with nothing in it.
 * @returns The state, with its reading spied on
 */
function setUp() {
  const load = vi.fn(() => Promise.resolve(buildOverview(installation(), new Map())));
  return { setup: new SetupState({ load, guardOn: true, onGuardChange: vi.fn() }), load };
}

afterEach(async () => {
  await closeEmmaSetup();
  document.body.innerHTML = '';
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
