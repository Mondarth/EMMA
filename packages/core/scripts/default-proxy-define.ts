/**
 * Builds EMMA's version lookup proxy into a bundle, as `__EMMA_DEFAULT_PROXY__` (see `src/default-proxy.ts`): run by
 * the Vite configurations of the module and the EMMA extension, under Node.
 */
import { obscure } from '../src/obscure.ts';

/**
 * The value of `__EMMA_DEFAULT_PROXY__` for a build.
 * @param env - The environment the build runs in
 * @returns JSON: the proxy's URL and key, obscured, or `null` without them
 * @throws Error for only one of them, or a URL that is not https or has no `{url}`, rather than build a broken release
 */
export function defaultProxyDefine(env: Readonly<Record<string, string | undefined>>): string {
  const url = env['EMMA_DEFAULT_PROXY_URL'] || undefined;
  const key = env['EMMA_DEFAULT_PROXY_KEY'] || undefined;
  if (url === undefined && key === undefined) return 'null';
  if (url === undefined) throw new Error('EMMA_DEFAULT_PROXY_KEY is set without EMMA_DEFAULT_PROXY_URL');
  if (key === undefined) throw new Error('EMMA_DEFAULT_PROXY_URL is set without EMMA_DEFAULT_PROXY_KEY');
  if (!url.startsWith('https://') || !url.includes('{url}'))
    throw new Error('EMMA_DEFAULT_PROXY_URL must be an https URL template containing {url}');
  return JSON.stringify({ url: obscure(url), key: obscure(key) });
}
