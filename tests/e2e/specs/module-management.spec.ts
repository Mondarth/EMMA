import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { joinAs, MODULE_ID, MODULE_TITLE, USERS } from '../support/foundry';

const EMMA_TITLE = 'EMMA - module management';
const EMMA_WINDOW = `#${MODULE_ID}-app`;

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

/**
 * Save the view EMMA shows the logged-in user.
 * @param page - A logged-in page
 * @param view - The view to store
 */
async function setView(page: Page, view: 'list' | 'split'): Promise<void> {
  await page.evaluate(
    async ([id, value]) => {
      await game.settings.set(id, 'view', value);
    },
    [MODULE_ID, view] as const,
  );
}

/**
 * Close the EMMA window, if it is open, through Foundry's public registry of open applications.
 * @param page - A logged-in page
 */
async function closeEmma(page: Page): Promise<void> {
  await page.evaluate(async id => {
    await foundry.applications.instances.get(id)?.close();
  }, `${MODULE_ID}-app`);
  await expect(page.locator(EMMA_WINDOW)).toHaveCount(0);
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

test.describe('EMMA views', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await setView(page, 'list');
  });

  test('the list view shows every installed module with its activation', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);

    await expect(emma.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(emma.getByRole('checkbox', { name: MODULE_TITLE })).toBeChecked();
    const installed = await page.evaluate(() => game.modules.size);
    await expect(emma.getByRole('list', { name: 'Installed modules' }).getByRole('listitem')).toHaveCount(installed);
  });

  test('a change staged in the list view is not saved', async ({ page }) => {
    await (await moduleManagementButton(page)).click();

    await page.locator(EMMA_WINDOW).getByRole('checkbox', { name: MODULE_TITLE }).uncheck();

    const saved = await page.evaluate(id => game.settings.get('core', 'moduleConfiguration')[id], MODULE_ID);
    expect(saved).toBe(true);
  });

  test('the view chosen is remembered when EMMA reopens', async ({ page }) => {
    const button = await moduleManagementButton(page);
    await button.click();
    const emma = page.locator(EMMA_WINDOW);

    await emma.getByRole('button', { name: 'Split view' }).click();
    await expect(emma.getByText('The split view is on its way.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => game.settings.get('mondarth-emma', 'view'))).toBe('split');

    await closeEmma(page);
    await button.click();

    await expect(emma.getByRole('button', { name: 'Split view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(emma.getByRole('list', { name: 'Installed modules' })).toHaveCount(0);
  });
});
