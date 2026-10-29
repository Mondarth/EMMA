import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import type { BrowserContext } from '@playwright/test';
import { chromium, expect, test as base } from '@playwright/test';

const EXTENSION = path.resolve(import.meta.dirname, '../../dist/chromium');

/** Chromium with the built extension loaded, and the extension's ID. */
const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument.
  context: async ({}, use) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-extension-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
});

test('the extension loads, its background starts, and it asks for no site until activated', async ({
  context,
  extensionId,
}) => {
  const worker = context.serviceWorkers().find(candidate => candidate.url().includes(extensionId));
  expect(worker?.url()).toBe(`chrome-extension://${extensionId}/background.js`);

  const granted = await worker?.evaluate(() => chrome.permissions.getAll());
  expect(granted?.origins).toEqual([]);
});

test("Chromium takes the scripts' paths from the extension's root, as Firefox needs them", async ({
  context,
  extensionId,
}) => {
  const worker = context.serviceWorkers().find(candidate => candidate.url().includes(extensionId));

  const registered = await worker?.evaluate(async () => {
    await chrome.scripting.registerContentScripts([
      { id: 'check', matches: ['http://localhost/*'], js: ['/loader.js'] },
    ]);
    const [script] = await chrome.scripting.getRegisteredContentScripts({ ids: ['check'] });
    await chrome.scripting.unregisterContentScripts({ ids: ['check'] });
    return script?.js;
  });

  // Chromium accepts the path, and keeps it as the same file at the extension's root.
  expect(registered).toEqual(['loader.js']);
});

test('its popup shows, explaining where EMMA runs', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`chrome-extension://${extensionId}/popup/index.html`);

  await expect(page.getByRole('heading', { name: 'EMMA for Foundry VTT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage servers' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('its options page lists no server yet', async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/options/index.html`);

  await expect(page.getByText('EMMA is not active on any server.', { exact: false })).toBeVisible();
});
