import { test as base, expect } from '@playwright/test';

/**
 * Console errors that are known and accepted. Keep this list short and explain every entry: Foundry modules commonly
 * look fine while throwing silently, so anything not listed here fails the test.
 */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

/**
 * The sites hypothetical mode looks package versions up on, which no test may reach. EMMA's own manifest is on its
 * documentation site, which has no manifest until a release publishes one.
 */
const PACKAGE_SITES =
  /^https:\/\/(api\.github\.com|github\.com|gitlab\.com|raw\.githubusercontent\.com|r2\.foundryvtt\.com|mondarth\.github\.io)\//;

export const test = base.extend<{
  failOnBrowserErrors: undefined;
  noCanvas: undefined;
  packageSitesStubbed: undefined;
}>({
  // Answer every request to a package site with nothing, so no test depends on, or uses up the rate limits of, sites
  // outside it. A test that needs an answer routes the request itself, as later routes are asked first.
  packageSitesStubbed: [
    async ({ page }, use) => {
      await page.route(PACKAGE_SITES, async route => {
        await route.fulfill({ json: [], headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await use(undefined);
    },
    { auto: true },
  ],

  // Turn on Foundry's "Disable Game Canvas" client setting, kept in local storage, before any page loads. No test uses
  // the canvas, and without a GPU the browsers draw it in software, which keeps most CPU cores busy and slows every
  // test.
  noCanvas: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        localStorage.setItem('core.noCanvas', 'true');
      });
      await use(undefined);
    },
    { auto: true },
  ],

  failOnBrowserErrors: [
    async ({ page }, use) => {
      const problems: string[] = [];

      page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!ALLOWED_CONSOLE_ERRORS.some(allowed => allowed.test(text))) problems.push(`console.error: ${text}`);
      });
      page.on('pageerror', error => {
        problems.push(`uncaught: ${error.message}`);
      });

      await use(undefined);

      expect(problems, 'unexpected errors in the browser').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
