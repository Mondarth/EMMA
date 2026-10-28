import { defineConfig } from '@playwright/test';

/**
 * Loads the built Chromium extension into Chromium, the one browser Playwright can load an extension into. Firefox's
 * build is checked by `web-ext lint` instead. Build the extension first (`pnpm build`).
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { trace: 'retain-on-failure' },
});
