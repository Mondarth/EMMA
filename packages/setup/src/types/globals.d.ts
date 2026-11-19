/**
 * What Vite's `define` puts in the bundle (see vite.config.ts).
 */
declare global {
  /**
   * The URL of EMMA's package catalogue a release is built with, or `null` for a build without one, as for development,
   * CI and tests. The extension asks it as its signed-in user, with no key (see `foundry/catalogue-relay.ts`).
   */
  const __EMMA_CATALOGUE_URL__: string | null;
  /** The browser extension's version, which the EMMA extension names to the catalogue. */
  const __EMMA_EXTENSION_VERSION__: string;
}

export {};
