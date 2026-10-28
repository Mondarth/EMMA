import path from 'node:path';

import type { Page } from '@playwright/test';

import { adminKey } from '../support/credentials';
import { expect, test } from '../support/fixtures';
import { MODULE_TITLE, WORLD } from '../support/foundry';

/**
 * The script the browser extension injects into the setup screen, built by `@mondarth/emma-setup`. The tests inject it
 * as the extension does, into the page itself, so they run in every browser, where Playwright can load an extension
 * into Chromium only.
 */
const SETUP_SCRIPT = path.resolve(import.meta.dirname, '../../../../setup/dist/emma-setup.js');

const EMMA_WINDOW = '#mondarth-emma-setup';

/**
 * Log in as the administrator and open the setup screen, returning from the test world first if it is running. The
 * usage-data question and the welcome tour, which Foundry shows a new browser, are dismissed.
 * @param page - The page
 */
async function openSetup(page: Page): Promise<void> {
  const key = adminKey();
  if (key === undefined)
    throw new Error('Give foundry_admin_key in .foundryvtt/secrets.json, or set FOUNDRY_ADMIN_KEY');

  const status = (await (await page.request.get('/api/status')).json()) as { active: boolean };
  if (status.active) {
    await page.goto('/join');
    await page.locator('input[name="adminPassword"]').fill(key);
    await page.getByRole('button', { name: 'Return to Setup' }).click();
    await page.waitForURL(/\/(auth|setup)/);
  }
  if (!page.url().endsWith('/setup')) {
    await page.goto('/auth');
    if (page.url().includes('/auth')) {
      await page.locator('input[name="adminPassword"]').fill(key);
      await page.getByRole('button', { name: 'Log In' }).click();
    }
    await page.waitForURL('**/setup');
  }
  await expect(page.getByRole('button', { name: 'Create World' })).toBeVisible();

  const sharing = page.getByRole('button', { name: 'Decline Sharing' });
  await sharing.click({ timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(() => foundry.nue.Tour.activeTour?.exit());
}

/**
 * Open the setup screen with EMMA brought in, as the extension does.
 * @param page - The page
 */
async function openSetupWithEmma(page: Page): Promise<void> {
  await openSetup(page);
  await page.addScriptTag({ path: SETUP_SCRIPT });
  await expect(page.getByRole('button', { name: 'EMMA', exact: true })).toBeVisible();
}

/**
 * The Add-on Modules tab's Install Module button.
 * @param page - A page on the setup screen
 * @returns The button
 */
async function installModuleButton(page: Page) {
  await page.locator('[data-action="tab"][data-tab="modules"]').click();
  const button = page.locator('#setup-packages-modules [data-action="installPackage"]');
  await expect(button).toBeVisible();
  return button;
}

test.describe('EMMA on the setup screen', () => {
  // The setup screen is only shown while no world runs, so these tests return to it, and then launch the test world
  // again for the tests that join it.
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await openSetup(page);
    const tile = page.locator(`[data-package-id="${WORLD.id}"]`);
    await tile.hover();
    await tile.locator('[data-action="worldLaunch"]').click();
    await page.waitForURL('**/join', { timeout: 120_000 });
    await page.close();
  });

  test("adds EMMA's button to the menu and disables Foundry's install and update buttons", async ({ page }) => {
    await openSetupWithEmma(page);

    const install = await installModuleButton(page);
    await expect(install).toHaveCSS('opacity', '0.4');
    await expect(page.locator('#setup-packages-modules [data-action="updateAll"]')).toHaveCSS('opacity', '0.4');

    await install.click();

    await expect(page.getByText('EMMA manages packages on this screen.', { exact: false })).toBeVisible();
    await expect(page.locator('#install-package')).toHaveCount(0);
  });

  test("shows the worlds with what their records say they run, and Foundry's buttons can be let back", async ({
    page,
  }) => {
    await openSetupWithEmma(page);
    await page.getByRole('button', { name: 'EMMA', exact: true }).click();
    const emma = page.locator(EMMA_WINDOW);
    const tree = emma.getByRole('tree', { name: 'Installation' });

    await expect(tree.getByRole('treeitem', { name: /^Foundry VTT 14\./ })).toHaveAttribute('aria-selected', 'true');
    await expect(emma.getByRole('heading', { name: /^Foundry VTT 14\./ })).toBeVisible();
    const world = tree.getByRole('treeitem', { name: new RegExp(WORLD.title) });
    await expect(world).toContainText('Matches its record');

    await world.click();
    await expect(emma.getByRole('heading', { name: WORLD.title })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(tree.getByRole('treeitem', { name: /libWrapper/ })).toBeVisible();
    // The world's title holds the module's, so the module's row is the one whose title its version follows.
    await tree.getByRole('treeitem', { name: new RegExp(`^${MODULE_TITLE} \\d`) }).click();
    await expect(emma.getByRole('heading', { name: MODULE_TITLE })).toBeVisible();
    await expect(emma.getByRole('region', { name: 'Run by' })).toContainText(WORLD.title);

    await tree.getByRole('treeitem', { name: /^Foundry VTT/ }).click();
    await emma.getByRole('checkbox', { name: 'Let Foundry install and update packages here' }).check();
    // EMMA's window covers the packages; close it to reach Foundry's buttons.
    await emma.locator('[data-action="close"]').click();
    await expect(emma).toHaveCount(0);
    const install = await installModuleButton(page);
    await expect(install).toHaveCSS('opacity', '1');
    await install.click();
    await expect(page.locator('#install-package')).toBeVisible();
  });
});
