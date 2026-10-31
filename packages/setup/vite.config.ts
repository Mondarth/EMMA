import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'node:path';

import { defineConfig } from 'vitest/config';

import { readDevServer } from './scripts/dev/dev-server.ts';
import { injectSetup } from './scripts/dev/inject-setup.ts';

/** Where the dev server serves its own files, so that every other path can go on to Foundry. */
const BASE = '/emma-setup-dev/';

/**
 * Builds `dist/emma-setup.js`: one classic script, with the components' styles inside it, which the browser extension
 * injects into Foundry VTT's setup screen as it is. Nothing else is loaded alongside it.
 *
 * `vite` (`pnpm dev:setup` from the root) serves a local Foundry through itself instead, with the EMMA extension's
 * source added to the setup page, which reloads on each change (see scripts/dev/inject-setup.ts).
 */
export default defineConfig(({ command, mode }) => {
  const serving = command === 'serve' && mode !== 'test';
  const dev = serving ? readDevServer(path.resolve(import.meta.dirname, '../..')) : undefined;
  const foundry = dev === undefined ? '' : `http://localhost:${dev.foundry}`;

  return {
    cacheDir: '.vite-cache',
    ...(serving && { base: BASE }),
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'happy-dom',
      setupFiles: ['tests/setup.ts'],
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts', 'src/**/*.svelte', 'scripts/**/*.ts'],
        // The entry point only starts the rest, and is exercised by the end-to-end tests.
        exclude: ['src/index.ts', 'src/types/**'],
        reportsDirectory: 'coverage',
        reporter: ['text', 'html', 'lcov'],
        // Ratchet these upward as coverage improves; never lower them to make a change pass.
        thresholds: { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
    ...(dev !== undefined && {
      server: {
        port: dev.port,
        strictPort: true,
        host: true,
        allowedHosts: [dev.hostname],
        proxy: {
          // Everything but the dev server's own files goes on to Foundry, with the browser's Host header kept, as
          // Foundry refuses a form whose Origin and Host differ (see packages/module/vite.config.ts).
          [`^(?!${BASE})`]: { target: foundry, changeOrigin: false },
          '/socket.io': { target: `ws://localhost:${dev.foundry}`, ws: true },
        },
      },
    }),
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
          // Served, the styles keep Svelte's own class names, which follow each change to a component.
          ...(!serving && {
            cssHash: ({ hash, css }: { hash: (input: string) => string; css: string }) => `emma-setup-${hash(css)}`,
          }),
        },
      }),
      ...(serving ? [injectSetup({ foundry, scripts: [`${BASE}@vite/client`, `${BASE}src/index.ts`] })] : []),
      ...(mode === 'test' ? [svelteTesting()] : []),
    ],
  };
});
