import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { joinAs, MODULE_ID, USERS, WORLD } from '../support/foundry';

/** Where Foundry serves the world record, which anyone may read, in a world or not. */
const RECORD_URL = `/worlds/${WORLD.id}/mondarth-emma.json`;

/** A fixture module, inactive in the test world, for a test to activate. */
const FIXTURE = 'emma-fixture-library';

/** A module as the record gives it. */
interface Recorded {
  id: string;
  version: string;
}

/**
 * Read the world record as a client outside the world would.
 * @param page - Any page, for its request context
 * @returns The record, or `null` if there is none yet
 */
async function readRecord(page: Page): Promise<{ core: string; system: Recorded; modules: Recorded[] } | null> {
  const response = await page.request.get(RECORD_URL, { headers: { 'Cache-Control': 'no-cache' } });
  return response.ok() ? ((await response.json()) as { core: string; system: Recorded; modules: Recorded[] }) : null;
}

/**
 * Wait until a logout has reached the join page and Foundry has finished loading it. The page goes on fetching its
 * translations after it loads; leaving it before they arrive makes Firefox and WebKit log the requests cut short as
 * errors.
 * @param page - The page logging out
 */
async function loggedOut(page: Page): Promise<void> {
  await page.waitForURL('**/join');
  await page.waitForLoadState('networkidle');
}

/**
 * Set whether a module is saved as active, without reloading the world.
 * @param page - A page logged in as the GM
 * @param id - The module
 * @param active - Whether it is saved as active
 */
async function setSavedActive(page: Page, id: string, active: boolean): Promise<void> {
  await page.evaluate(
    async ([moduleId, value]) => {
      const configuration = game.settings.get('core', 'moduleConfiguration');
      await game.settings.set('core', 'moduleConfiguration', { ...configuration, [moduleId]: value });
    },
    [id, active] as const,
  );
}

test('the GM keeps a record of the world setup in the world folder', async ({ page }) => {
  await joinAs(page, USERS.gm);
  const platform = await page.evaluate(() => ({ core: game.version, system: game.system.id }));

  await expect
    .poll(async () => {
      const record = await readRecord(page);
      return record && { core: record.core, system: record.system.id, modules: record.modules.map(({ id }) => id) };
    })
    .toEqual({ ...platform, modules: expect.arrayContaining([MODULE_ID, 'lib-wrapper']) as unknown });
});

test('logging out brings the world record up to date first', async ({ page }) => {
  await joinAs(page, USERS.gm);
  try {
    await setSavedActive(page, FIXTURE, true);

    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Log Out' }).click();
    await loggedOut(page);

    expect((await readRecord(page))?.modules.map(({ id }) => id)).toContain(FIXTURE);
  } finally {
    await joinAs(page, USERS.gm);
    await setSavedActive(page, FIXTURE, false);
    // Log out through the same method, which leaves the record as the world is.
    await page.evaluate(() => {
      game.logOut();
    });
    await loggedOut(page);
  }

  expect((await readRecord(page))?.modules.map(({ id }) => id)).not.toContain(FIXTURE);
});
