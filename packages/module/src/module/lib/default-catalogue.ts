/**
 * The package catalogue EMMA asks first when it uses its own version lookup: built into a release, obscured (see
 * `@mondarth/emma-core/default-catalogue`). Development, CI and test builds have none.
 */
import type { BuiltCatalogue, DefaultCatalogue } from '@mondarth/emma-core/default-catalogue';
import { revealCatalogue } from '@mondarth/emma-core/default-catalogue';

export type { DefaultCatalogue };

/**
 * The default catalogue this build has.
 * @param built - What the build put in, obscured; this build's own unless given
 * @returns The catalogue, or `null` for a build without one
 */
export function defaultCatalogue(built: BuiltCatalogue = __EMMA_DEFAULT_CATALOGUE__): DefaultCatalogue | null {
  return revealCatalogue(built);
}
