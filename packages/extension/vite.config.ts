import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import packageJSON from './package.json' with { type: 'json' };
import { manifestFor } from './scripts/manifest.ts';
import type { Target } from './src/lib/sites.ts';

/** The script the extension brings into the setup screen, built by `@mondarth/emma-setup`. */
const SETUP_SCRIPT = path.resolve(import.meta.dirname, '../setup/dist/emma-setup.js');

/**
 * Write the manifest for the browser built for, and copy in the setup screen's script.
 * @param target - The browser
 * @returns A Vite plugin
 */
function extensionFiles(target: Target): Plugin {
  return {
    name: 'mondarth-emma:extension-files',
    apply: 'build',
    generateBundle() {
      if (!fs.existsSync(SETUP_SCRIPT)) {
        throw new Error(`Build @mondarth/emma-setup first: ${SETUP_SCRIPT} is missing`);
      }
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifestFor(target, packageJSON.version), null, 2)}\n`,
      });
      this.emitFile({ type: 'asset', fileName: 'emma-setup.js', source: fs.readFileSync(SETUP_SCRIPT) });
    },
  };
}

/**
 * Builds the extension for one browser, named by the mode (`vite build --mode chromium` or `--mode firefox`), into
 * `dist/<browser>`. Tests run in the `test` mode, as Chromium.
 */
export default defineConfig(({ mode }) => {
  const target: Target = mode === 'firefox' ? 'firefox' : 'chromium';
  return {
    root: 'src',
    publicDir: '../public',
    cacheDir: '../.vite-cache',
    define: { __TARGET__: JSON.stringify(target) },
    test: {
      root: '.',
      include: ['tests/unit/**/*.test.ts'],
      environment: 'happy-dom',
      setupFiles: ['tests/setup.ts'],
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts', 'src/**/*.svelte', 'scripts/**/*.ts'],
        // The pages' scripts only mount the components, and the loader only sends a message; the end-to-end check of
        // the built extension covers them. The release's packaging script only builds, zips and signs, as the module's
        // does: a release runs it, and it can be run by hand (docs/developers/releases.md).
        exclude: ['src/popup/main.ts', 'src/options/main.ts', 'src/loader.ts', 'src/types/**', 'scripts/release/**'],
        reportsDirectory: 'coverage',
        reporter: ['text', 'html', 'lcov'],
        // Ratchet these upward as coverage improves; never lower them to make a change pass.
        thresholds: { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
    build: {
      outDir: `../dist/${target}`,
      emptyOutDir: true,
      sourcemap: false,
      minify: false,
      target: ['es2022'],
      rolldownOptions: {
        input: {
          background: 'src/background.ts',
          loader: 'src/loader.ts',
          popup: 'src/popup/index.html',
          options: 'src/options/index.html',
        },
        output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
      },
    },
    plugins: [
      svelte(),
      ...(mode === 'test' ? [svelteTesting()] : []),
      ...(mode === 'test' ? [] : [extensionFiles(target)]),
    ],
  };
});
