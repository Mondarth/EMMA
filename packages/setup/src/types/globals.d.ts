/**
 * What Vite's `define` puts in the bundle (see vite.config.ts).
 */
import type { BuiltCatalogue } from '@mondarth/emma-core/default-catalogue';

declare global {
  /**
   * EMMA's package catalogue a release is built with, obscured, or `null` for a build without one, as for development,
   * CI and tests. Read only through `revealCatalogue()`.
   */
  const __EMMA_DEFAULT_CATALOGUE__: BuiltCatalogue;
  /** The browser extension's version, which the EMMA extension names to the catalogue. */
  const __EMMA_EXTENSION_VERSION__: string;
}

export {};
