/**
 * The version lookup proxy EMMA uses unless a GM sets their own: built into a release from the
 * `EMMA_DEFAULT_PROXY_URL` and `EMMA_DEFAULT_PROXY_KEY` it is built with, obscured (see `scripts/build/default-proxy.ts`).
 * Development, CI and test builds have none.
 */
import type { Obscured } from './obscure';
import { reveal } from './obscure';

/** The default proxy: its URL template, containing `{url}`, and the API key it asks for. */
export interface DefaultProxy {
  readonly url: string;
  readonly key: string;
}

/**
 * The default proxy this build has.
 * @param built - What the build put in, obscured; this build's own unless given
 * @returns The proxy, or `null` for a build without one
 */
export function defaultProxy(
  built: { readonly url: Obscured; readonly key: Obscured } | null = __EMMA_DEFAULT_PROXY__,
): DefaultProxy | null {
  return built === null ? null : { url: reveal(built.url), key: reveal(built.key) };
}
