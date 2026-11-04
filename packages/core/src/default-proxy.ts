/**
 * EMMA's version lookup proxy, which a release is built with from the `EMMA_DEFAULT_PROXY_URL` (a repository
 * variable) and `EMMA_DEFAULT_PROXY_KEY` (a secret) the release workflow sets. Vite puts them, obscured, in each
 * bundle's `__EMMA_DEFAULT_PROXY__` (see `scripts/default-proxy-define.ts`), and the bundle reveals them as it fetches
 * through the proxy (see {@link revealProxy}). A build with neither, as for development and CI, has no proxy. Shared by
 * the module and the EMMA extension on the setup screen; see docs/developers/default-proxy.md.
 */
import type { Obscured } from './obscure';
import { reveal } from './obscure';

/** The proxy: its URL template, containing `{url}`, and the API key it asks for. */
export interface DefaultProxy {
  readonly url: string;
  readonly key: string;
}

/** The proxy as a build has it, obscured, or `null` for a build without one. */
export type BuiltProxy = { readonly url: Obscured; readonly key: Obscured } | null;

/**
 * The proxy a build has.
 * @param built - What the build put in, obscured
 * @returns The proxy, or `null` for a build without one
 */
export function revealProxy(built: BuiltProxy): DefaultProxy | null {
  return built === null ? null : { url: reveal(built.url), key: reveal(built.key) };
}
