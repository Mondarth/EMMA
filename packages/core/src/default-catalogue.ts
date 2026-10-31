/**
 * EMMA's package catalogue, which a release is built with from the `EMMA_DEFAULT_CATALOGUE_URL` (a repository
 * variable) and `EMMA_DEFAULT_CATALOGUE_KEY` (a secret) the release workflow sets. Vite puts them, obscured, in each
 * bundle's `__EMMA_DEFAULT_CATALOGUE__` (see `scripts/default-catalogue-define.ts`), and the bundle reveals them as it asks the
 * catalogue (see {@link revealCatalogue}). A build with neither, as for development and CI, has no catalogue. Shared by
 * the module and the EMMA extension on the setup screen; see docs/developers/default-proxy.md.
 */
import type { Obscured } from './obscure';
import { reveal } from './obscure';

/** The catalogue: its URL, and the API key it asks for. */
export interface DefaultCatalogue {
  readonly url: string;
  readonly key: string;
}

/** The catalogue as a build has it, obscured, or `null` for a build without one. */
export type BuiltCatalogue = { readonly url: Obscured; readonly key: Obscured } | null;

/**
 * The catalogue a build has.
 * @param built - What the build put in, obscured
 * @returns The catalogue, or `null` for a build without one
 */
export function revealCatalogue(built: BuiltCatalogue): DefaultCatalogue | null {
  return built === null ? null : { url: reveal(built.url), key: reveal(built.key) };
}
