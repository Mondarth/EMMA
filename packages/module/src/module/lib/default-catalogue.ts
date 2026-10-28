/**
 * The package catalogue EMMA asks first when it uses its own version lookup: built into a release from the
 * `EMMA_DEFAULT_CATALOGUE_URL` and `EMMA_DEFAULT_CATALOGUE_KEY` it is built with, obscured (see
 * `scripts/build/default-catalogue.ts`). Development, CI and test builds have none.
 */
import type { Obscured } from './obscure';
import { reveal } from './obscure';

/** The default catalogue: its URL, and the API key it asks for. */
export interface DefaultCatalogue {
  readonly url: string;
  readonly key: string;
}

/**
 * The default catalogue this build has.
 * @param built - What the build put in, obscured; this build's own unless given
 * @returns The catalogue, or `null` for a build without one
 */
export function defaultCatalogue(
  built: { readonly url: Obscured; readonly key: Obscured } | null = __EMMA_DEFAULT_CATALOGUE__,
): DefaultCatalogue | null {
  return built === null ? null : { url: reveal(built.url), key: reveal(built.key) };
}
