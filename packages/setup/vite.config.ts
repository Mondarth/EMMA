import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

/**
 * Builds `dist/emma-setup.js`: one classic script, with the components' styles inside it, which the browser extension
 * injects into Foundry VTT's setup screen as it is. Nothing else is loaded alongside it.
 */
export default defineConfig(({ mode }) => ({
  cacheDir: '.vite-cache',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.svelte'],
      // The entry point only starts the rest, and is exercised by the end-to-end tests.
      exclude: ['src/index.ts', 'src/types/**'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov'],
      // Ratchet these upward as coverage improves; never lower them to make a change pass.
      thresholds: { statements: 100, branches: 95, functions: 100, lines: 100 },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    target: ['es2022'],
    lib: { entry: 'src/index.ts', formats: ['iife'], name: 'MondarthEmmaSetup', fileName: () => 'emma-setup.js' },
  },
  plugins: [
    svelte({
      compilerOptions: {
        // The styles travel inside the script, as the extension injects nothing else.
        css: 'injected',
        cssHash: ({ hash, css }: { hash: (input: string) => string; css: string }) => `emma-setup-${hash(css)}`,
      },
    }),
    ...(mode === 'test' ? [svelteTesting()] : []),
  ],
}));
