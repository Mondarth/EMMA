/**
 * What Vite's `define` puts in the bundle (see vite.config.ts).
 */
import type { BuiltCatalogue } from '@mondarth/emma-core/default-catalogue';
import type { BuiltProxy } from '@mondarth/emma-core/default-proxy';

declare global {
  /**
   * EMMA's package catalogue a release is built with, obscured, or `null` for a build without one, as for development,
   * CI and tests. Read only through `revealCatalogue()`.
   */
  const __EMMA_DEFAULT_CATALOGUE__: BuiltCatalogue;
  /**
   * EMMA's version lookup proxy a release is built with, obscured, or `null` for a build without one, as for
   * development, CI and tests. Read only through `revealProxy()`.
   */
  const __EMMA_DEFAULT_PROXY__: BuiltProxy;
  /** The browser extension's version, which the EMMA extension names to the proxy and the catalogue. */
  const __EMMA_EXTENSION_VERSION__: string;
}

export {};
