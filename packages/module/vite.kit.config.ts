/**
 * Builds the setup kit, `dist/emma-setup-kit.js` (see `src/setup-kit.ts`): one ES module, apart from the module's own
 * bundle, which the EMMA extension imports on the setup screen. Run after `vite.config.ts` by `pnpm build`, into the
 * same `dist/`.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/',
  publicDir: false,
  cacheDir: '../.vite-cache',
  resolve: { conditions: ['browser', 'import'] },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    // As for the module's own bundle: unminified, with a sourcemap.
    sourcemap: true,
    minify: false,
    target: ['es2022'],
    lib: { entry: './setup-kit.ts', formats: ['es'], fileName: 'emma-setup-kit' },
  },
});
