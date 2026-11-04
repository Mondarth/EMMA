/**
 * The version lookup proxy EMMA uses unless a GM sets their own: built into a release, obscured (see
 * `@mondarth/emma-core/default-proxy`). Development, CI and test builds have none.
 */
import type { BuiltProxy, DefaultProxy } from '@mondarth/emma-core/default-proxy';
import { revealProxy } from '@mondarth/emma-core/default-proxy';

export type { DefaultProxy };

/**
 * The default proxy this build has.
 * @param built - What the build put in, obscured; this build's own unless given
 * @returns The proxy, or `null` for a build without one
 */
export function defaultProxy(built: BuiltProxy = __EMMA_DEFAULT_PROXY__): DefaultProxy | null {
  return revealProxy(built);
}
