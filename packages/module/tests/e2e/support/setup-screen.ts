/**
 * The setup screen with EMMA brought in as the browser extension brings it, for the specs that use EMMA there
 * (`specs/setup-screen.spec.ts`, and the store's screenshots in `store/screenshots.spec.ts`).
 */
import path from 'node:path';

import type { Page } from '@playwright/test';

import { adminKey } from './credentials';
import { expect, standInBridge } from './fixtures';

/**
 * The script the browser extension injects into the setup screen, built by `@mondarth/emma-setup`. The tests inject it
 * as the extension does, into the page itself, so they run in every browser, where Playwright can load an extension
 * into Chromium only.
 */
export const SETUP_SCRIPT = path.resolve(import.meta.dirname, '../../../../setup/dist/emma-setup.js');

export const EMMA_WINDOW = '#mondarth-emma-setup';

/**
 * Log in as the administrator and open the setup screen, returning from the test world first if it is running. The
 * usage-data question and the welcome tour, which Foundry shows a new browser, are dismissed.
 * @param page - The page
 */
export async function openSetup(page: Page): Promise<void> {
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
 * Open the setup screen with EMMA brought in, as the extension does, with a stand-in for its bridge.
 * @param page - The page
 * @param token - The token of the user the extension is signed in as, or `null` for no one; a subscriber by default
 */
export async function openSetupWithEmma(page: Page, token?: string | null): Promise<void> {
  await openSetup(page);
  await standInBridge(page, token);
  await page.addScriptTag({ path: SETUP_SCRIPT });
  await expect(page.getByRole('button', { name: 'EMMA', exact: true })).toBeVisible();
}
