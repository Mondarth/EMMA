/** The browser the extension is built for, set by the build (see `vite.config.ts`); `Target` in `lib/sites.ts`. */
declare const __TARGET__: 'chromium' | 'firefox';

/**
 * The URL of EMMA's package catalogue the build has, or `null` for a build without one, as for development, CI and
 * tests: the extension signs its user in to it (see `browser/catalogue.ts`).
 */
declare const __EMMA_CATALOGUE_URL__: string | null;

/** The URL of Mondarth's accounts, where the user signs in, or `null` for a build that signs in at the catalogue. */
declare const __EMMA_ACCOUNTS_URL__: string | null;
