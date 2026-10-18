import { test as base, expect } from '@playwright/test';

/**
 * Console errors that are known and accepted. Keep this list short and explain every entry: Foundry modules commonly
 * look fine while throwing silently, so anything not listed here fails the test.
 */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

export const test = base.extend<{ failOnBrowserErrors: undefined; noCanvas: undefined }>({
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
