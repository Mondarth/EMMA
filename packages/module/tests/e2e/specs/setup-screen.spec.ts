import type { Page } from '@playwright/test';

import { CATALOGUE, expect, routeCatalogue, test } from '../support/fixtures';
import { MODULE_TITLE, WORLD } from '../support/foundry';
import { EMMA_WINDOW, openSetup, openSetupWithEmma } from '../support/setup-screen';

/** The title of the test world's game system, under which the tree shows the world. */
const SYSTEM_TITLE = 'Dungeons & Dragons Fifth Edition';

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
    // Worlds are shown under their own row, open at first, and the game system under it.
    await expect(tree.getByRole('treeitem', { name: /^Worlds/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(tree.getByRole('treeitem', { name: new RegExp(`^${SYSTEM_TITLE} `) })).toBeVisible();
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
    await expect(emma.getByRole('region', { name: 'Active in' })).toContainText(WORLD.title);

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

  test("finds updates in the catalogue as the extension's signed-in user, with their token and no key", async ({
    page,
  }) => {
    const asked: { path: string; authorization: string | undefined; key: string | undefined }[] = [];
    await routeCatalogue(page, (endpoint, _body, request) => {
      asked.push({
        path: endpoint,
        authorization: request.headers()['authorization'],
        key: request.headers()['x-api-key'],
      });
      return undefined;
    });
    await openSetupWithEmma(page);
    await page.getByRole('button', { name: 'EMMA', exact: true }).click();

    await expect(page.locator(EMMA_WINDOW).getByRole('status').first()).toContainText(
      /No updates found|updates? found/,
    );
    expect(asked.map(request => request.path)).toEqual(expect.arrayContaining(['api/v2/me', 'api/v2/lookup']));
    for (const request of asked) {
      expect(request.authorization).toBe('Bearer e2e-user-token');
      expect(request.key).toBeUndefined();
    }
  });

  test('asks a user not signed in to sign in, from the extension, before finding updates', async ({ page }) => {
    const asked: string[] = [];
    await routeCatalogue(page, endpoint => {
      asked.push(endpoint);
      return undefined;
    });
    await openSetupWithEmma(page, null);
    await page.getByRole('button', { name: 'EMMA', exact: true }).click();
    const emma = page.locator(EMMA_WINDOW);

    await expect(
      emma.getByText("Finding updates needs you signed in to EMMA's catalogue", { exact: false }),
    ).toBeVisible();
    await emma.getByRole('button', { name: "Sign in to EMMA's catalogue" }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'emmaSignInOpened') as number | undefined)).toBe(1);
    // Nothing is asked of the catalogue for someone not signed in.
    expect(asked).toEqual([]);
  });

  test('asks a user whose subscription ended to renew it, at the catalogue', async ({ page }) => {
    await routeCatalogue(page, endpoint =>
      endpoint === 'api/v2/me'
        ? {
            user: { handle: 'e2e-lapsed', nickname: null, role: 'user' },
            subscription: { paidUntil: '2026-10-01T00:00:00.000Z', active: false },
            entitled: false,
          }
        : undefined,
    );
    await openSetupWithEmma(page);
    await page.getByRole('button', { name: 'EMMA', exact: true }).click();
    const emma = page.locator(EMMA_WINDOW);

    await expect(emma.getByText('Your EMMA subscription ended on', { exact: false })).toBeVisible();
    await expect(emma.getByRole('link', { name: 'Renew your subscription' })).toHaveAttribute(
      'href',
      `${CATALOGUE}subscription`,
    );
  });
});
