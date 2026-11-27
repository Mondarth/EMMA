/**
 * The browser extension's store screenshots: EMMA on a real Foundry VTT setup screen, at the stores' 1280 × 800, with
 * the made-up installation `scripts/e2e/install-packages.ts --store` sets up and the catalogue's answers of
 * `catalogue.ts`. Run by the E2E workflow when asked for its screenshots (`screenshots: true`), as the `store` project;
 * the PNGs land in `store-screenshots/`, which the workflow uploads. Not a test: it checks only what it needs to stage
 * each scene.
 */
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, routeCatalogue, test } from '../support/fixtures';
import { EMMA_WINDOW, openSetupWithEmma } from '../support/setup-screen';
import { listing, lookup } from './catalogue';

/** Where the screenshots go. */
const OUT = path.resolve(import.meta.dirname, '../store-screenshots');

/**
 * Have EMMA's window take the whole page, as a store's screenshot shows only EMMA.
 * @param page - The page
 */
async function fillPage(page: Page): Promise<void> {
  await page.evaluate(id => {
    const app = foundry.applications.instances.get(id);
    app?.setPosition({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  }, EMMA_WINDOW.slice(1));
}

/**
 * Open EMMA's window over the whole page, with the catalogue answering as `catalogue.ts` says.
 * @param page - The page
 * @returns EMMA's window
 */
async function openEmma(page: Page): Promise<Locator> {
  await routeCatalogue(page, endpoint => {
    if (endpoint === 'api/v2/lookup') return lookup();
    if (endpoint === 'api/v2/listing') return listing();
    return undefined;
  });
  // The update plan takes most of the window's height, below the tree, so that its changes show with its backups.
  await page.addInitScript(() => {
    localStorage.setItem('mondarth-emma.setup.layout', JSON.stringify({ tree: 0.4, plan: 0.62 }));
  });
  await openSetupWithEmma(page);
  // The setup screen may still be settling as its menu is clicked: asked again once, it is not.
  const button = page.getByRole('button', { name: 'EMMA', exact: true });
  await button.click({ timeout: 20_000 }).catch(() => button.click({ force: true }));
  const emma = page.locator(EMMA_WINDOW);
  // The first window on a fresh server takes a while: it reads the installation and the worlds' records.
  await expect(emma)
    .toBeVisible({ timeout: 60_000 })
    .catch(async () => {
      await button.click({ force: true });
      await expect(emma).toBeVisible({ timeout: 60_000 });
    });
  await fillPage(page);
  await expect(emma.getByRole('status').first()).toContainText(/updates? (available|found)/i, { timeout: 60_000 });
  return emma;
}

/**
 * A row of the installation tree, by the text of its title.
 * @param emma - EMMA's window
 * @param title - The title, as a pattern
 * @returns The row
 */
const row = (emma: Locator, title: RegExp): Locator =>
  emma.getByRole('tree', { name: 'Installation' }).getByRole('treeitem', { name: title }).first();

/**
 * Open a row of the tree, from the keyboard, as its triangle does.
 * @param page - The page
 * @param emma - EMMA's window
 * @param title - The row's title, as a pattern
 */
async function expand(page: Page, emma: Locator, title: RegExp): Promise<void> {
  const target = row(emma, title);
  await target.click();
  if ((await target.getAttribute('aria-expanded')) === 'false') await page.keyboard.press('ArrowRight');
}

/**
 * Save the page as a store screenshot, once what it shows has settled.
 * @param page - The page
 * @param name - The file's name, without `.png`
 */
async function shoot(page: Page, name: string): Promise<void> {
  // The window grows and shrinks as panels open; it takes the whole page again for the picture.
  await fillPage(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

test.describe('the store screenshots', () => {
  test.describe.configure({ mode: 'serial' });

  test('1: the installation tree, and a module with an update', async ({ page }) => {
    const emma = await openEmma(page);
    await expand(page, emma, /^Modules/);
    await expand(page, emma, /Universal/);
    await row(emma, /Token Tracker/).click();
    await expect(emma.getByRole('heading', { level: 2, name: 'Token Tracker' })).toBeVisible();
    await shoot(page, '1-installation-tree');
  });

  test('2: a version list, and why the plan takes the version it does', async ({ page }) => {
    const emma = await openEmma(page);
    await expand(page, emma, /^Modules/);
    await expand(page, emma, /Universal/);
    await row(emma, /Ambient Weather/).click();
    // 2.4.0 chosen, the panel says why not 2.5.0, its newest, which needs a newer Foundry VTT; the list, open again,
    // shows what else may be chosen.
    await emma.getByRole('button', { name: /^Version of Ambient Weather/ }).click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /^2\.4\.0/ })
      .click();
    await expect(emma.getByText(/2\.5\.0/).first()).toBeVisible({ timeout: 30_000 });
    await emma.getByRole('button', { name: /^Version of Ambient Weather/ }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await shoot(page, '2-version-list');
  });

  test('3: the update plan, with its backups and snapshot', async ({ page }) => {
    const emma = await openEmma(page);
    await row(emma, /^Foundry VTT/).click();
    await emma.getByRole('button', { name: 'Plan the best versions' }).click();
    const plan = emma.getByRole('region', { name: 'Update plan' });
    await expect(plan).toBeVisible({ timeout: 60_000 });
    await expect(plan.getByRole('row').nth(2)).toBeVisible();
    await shoot(page, '3-update-plan');
  });

  test('4: the steps of the plan, listed before it runs', async ({ page }) => {
    const emma = await openEmma(page);
    await row(emma, /^Foundry VTT/).click();
    await emma.getByRole('button', { name: 'Plan the best versions' }).click();
    const plan = emma.getByRole('region', { name: 'Update plan' });
    await expect(plan).toBeVisible({ timeout: 60_000 });
    await plan.getByRole('button', { name: 'Run plan' }).click();
    // Shown, never run: the made-up packages have nothing to install.
    await expect(plan.getByRole('alertdialog')).toBeVisible();
    await shoot(page, '4-before-running');
  });

  test("5: installing a module from Foundry's listing", async ({ page }) => {
    const emma = await openEmma(page);
    await row(emma, /^Modules/).click();
    const install = emma.getByRole('region', { name: 'Install a module' });
    await expect(install).toBeVisible();
    await install.getByText('Lantern Light', { exact: true }).click();
    const details = install.getByText('Flickering torches', { exact: false });
    await expect(details).toBeVisible();
    // The drawer opens at the foot of the list: the panel scrolls to show it all.
    await details.evaluate(element => {
      element.closest('details')?.scrollIntoView({ block: 'end' });
    });
    await shoot(page, '5-install');
  });
});
