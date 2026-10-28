import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-plugin-prettier/recommended';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.foundryvtt/',
      'docs/_build/',
      '**/.vite-cache/',
      '**/coverage/',
      '**/dist/',
      '**/releases/',
      '**/tests/e2e/.data/',
      '**/tests/e2e/test-results/',
      '**/tests/e2e/playwright-report/',
    ],
  },
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  svelte.configs.recommended,
  jsdoc.configs['flat/recommended-typescript-error'],
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./packages/*/tsconfig.test.json', './packages/*/tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },

    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowBoolean: true, allowNumber: true }],
      'no-shadow': [
        'error',
        {
          builtinGlobals: true,
          hoist: 'all',
          allow: ['document', 'event', 'name', 'parent', 'status', 'top'],
        },
      ],
    },
  },
  {
    // Module source runs in the Foundry client, where jQuery is still a global.
    files: ['packages/module/src/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.jquery } },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    // Svelte's `{@render snippet()}` tag renders a snippet, which returns void; the rule mistakes it for a misused value.
    files: ['**/*.svelte'],
    rules: { '@typescript-eslint/no-confusing-void-expression': 'off' },
  },
  {
    // Assertions on mocked methods (`expect(obj.method)`) are safe; the rule cannot tell them from real unbound calls.
    files: ['packages/*/tests/**'],
    rules: { '@typescript-eslint/unbound-method': 'off' },
  },
  {
    // Plain JS tool configs are not part of any TypeScript project.
    files: ['**/*.mjs', '**/*.js'],
    extends: [ts.configs.disableTypeChecked],
  },
  // Must stay last: turns off formatting rules that conflict with Prettier and reports Prettier diffs as errors.
  prettier,
);
