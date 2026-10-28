export default {
  // ESLint also applies Prettier (eslint-plugin-prettier), so these files need no separate format step.
  '*.{ts,mts,js,mjs,svelte}': 'eslint --fix',
  // Vitest runs in the package, with its configuration; it is given the staged files' absolute paths.
  'packages/module/**/*.{ts,mts,js,mjs,svelte}': files =>
    `pnpm --filter @mondarth/emma-module exec vitest related --run --passWithNoTests ${files.join(' ')}`,
  // tsc cannot check single files against the project config, so check every package whenever TypeScript is staged.
  '*.{ts,mts,svelte}': () => 'pnpm typecheck',
  '*.{json,css,scss,md,yml,yaml}': 'prettier --write',
};
