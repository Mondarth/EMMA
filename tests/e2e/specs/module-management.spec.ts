import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { joinAs, MODULE_ID, USERS } from '../support/foundry';

const EMMA_TITLE = 'EMMA - module management';

/**
 * Open the Settings tab of the sidebar and return its Module Management button. The button is found by the markup
 * EMMA's interception relies on (`src/module/foundry/settings-entry.ts`), so a change to it in Foundry fails here.
 * @param page - A page showing the game view
 * @returns The button
 */
async function moduleManagementButton(page: Page) {
  // Click the tab as a user would: unlike `Sidebar#changeTab`, a click also expands a collapsed sidebar.
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const button = page.locator('#settings [data-action="openApp"][data-app="modules"]');
  await expect(button).toBeVisible();
  return button;
}

/**
 * Set whether EMMA is disabled in the test world.
 * @param page - A page logged in as the GM
 * @param disabled - The value to store
 */
async function setDisabled(page: Page, disabled: boolean): Promise<void> {
  await page.evaluate(
    async ([id, value]) => {
      await game.settings.set(id, 'disabled', value);
    },
    [MODULE_ID, disabled] as const,
  );
}

test.describe('Module Management', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
  });

  test.afterEach(async ({ page }) => {
    await setDisabled(page, false);
  });

  test('the Settings sidebar opens EMMA instead of Module Management', async ({ page }) => {
    await (await moduleManagementButton(page)).click();

    await expect(page.getByText(EMMA_TITLE, { exact: true })).toBeVisible();
    await expect(page.locator('#module-management')).toHaveCount(0);
  });

  test('a second click brings back the same window', async ({ page }) => {
    const button = await moduleManagementButton(page);

    await button.click();
    await button.click();

    await expect(page.getByText(EMMA_TITLE, { exact: true })).toHaveCount(1);
  });

  test('Disable EMMA restores Module Management without a reload', async ({ page }) => {
    await setDisabled(page, true);

    await (await moduleManagementButton(page)).click();

    await expect(page.locator('#module-management')).toBeVisible();
    await expect(page.getByText(EMMA_TITLE, { exact: true })).toHaveCount(0);
  });
});
