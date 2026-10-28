import { sveltePreprocess } from 'svelte-preprocess';

// Shared by the Vite plugin, svelte-check and eslint-plugin-svelte.
export default {
  preprocess: sveltePreprocess(),
};
