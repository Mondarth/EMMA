import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.vite-cache',
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov'],
      // Ratchet these upward as coverage improves; never lower them to make a change pass.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
