import type { Page, Request as PageRequest } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

/**
 * Console errors that are known and accepted. Keep this list short and explain every entry: Foundry modules commonly
 * look fine while throwing silently, so anything not listed here fails the test.
 */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

/** The sites hypothetical mode looks package versions up on, which no test may reach. */
const PACKAGE_SITES =
  /^https:\/\/(api\.github\.com|github\.com|gitlab\.com|raw\.githubusercontent\.com|r2\.foundryvtt\.com)\//;

/**
 * EMMA's package catalogue as the end-to-end build has it, with its key (see `.github/workflows/e2e.yml`): made up, so
 * that no test reaches the real one, and answered by {@link routeCatalogue}.
 */
export const CATALOGUE = 'https://catalogue.e2e.test/';
export const CATALOGUE_KEY = 'e2e-catalogue-key';

/** The headers the catalogue answers with, as the real one does, so that the browser reads what it gives. */
const CATALOGUE_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match, X-API-Key, X-Catalogue-Client',
  'Access-Control-Expose-Headers': 'ETag',
};

/** What each of the catalogue's endpoints answers when a test gives nothing else: nothing held. */
const CATALOGUE_NOTHING: Readonly<Record<string, unknown>> = {
  'api/v2/lookup': { core: [], packages: [], pending: [], unavailable: [], unreached: [], asOf: null },
  'api/v2/listing': { packages: [], asOf: null },
  'api/v2/recheck': { packages: [], pending: [] },
  'api/v2/manifest': { ok: false, problem: 'not-manifest' },
};

/**
 * Answer the catalogue's requests, as the browser makes them, preflights too. A test's answers take the place of those
 * of the routes before, as Playwright asks the latest route first.
 * @param page - The page
 * @param answer - The JSON to answer an endpoint with, given its path, such as `api/v2/lookup`, and what it was sent;
 *   `undefined` to answer with nothing held
 */
export async function routeCatalogue(
  page: Page,
  answer: (path: string, body: unknown, request: PageRequest) => unknown = () => undefined,
): Promise<void> {
  await page.route(`${CATALOGUE}**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CATALOGUE_CORS });
      return;
    }
    const path = new URL(request.url()).pathname.replace(/^\//, '');
    const body: unknown = request.postData() === null ? undefined : request.postDataJSON();
    await route.fulfill({
      headers: CATALOGUE_CORS,
      json: answer(path, body, request) ?? CATALOGUE_NOTHING[path] ?? {},
    });
  });
}

export const test = base.extend<{
  catalogueStubbed: undefined;
  failOnBrowserErrors: undefined;
  noCanvas: undefined;
  packageSitesStubbed: undefined;
}>({
  // Answer the made-up catalogue the build asks with nothing held, so that a test that gives no answers of its own
  // finds only what is installed.
  catalogueStubbed: [
    async ({ page }, use) => {
      await routeCatalogue(page);
      await use(undefined);
    },
    { auto: true },
  ],

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
