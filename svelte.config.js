import { sveltePreprocess } from 'svelte-preprocess';

// Shared by the Vite plugin, svelte-check and eslint-plugin-svelte. Compiler options stay in vite.config.ts, where they
// depend on the build mode.
export default {
  preprocess: sveltePreprocess(),
};
