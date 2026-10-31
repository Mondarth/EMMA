/**
 * Builds the default version lookup proxy into a release. The release workflow sets `EMMA_DEFAULT_PROXY_URL` (a
 * repository variable) and `EMMA_DEFAULT_PROXY_KEY` (a secret); Vite puts them, obscured, in `__EMMA_DEFAULT_PROXY__`.
 * A build with neither, as for development and CI, has no default proxy. See docs/developers/default-proxy.md.
 */
import fs from 'node:fs';
import path from 'node:path';

import { obscure } from '@mondarth/emma-core/obscure';

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

/**
 * The files under a directory that hold a secret in plain text.
 * @param dir - The directory, such as `dist`
 * @param secret - The secret
 * @returns Their paths
 */
export function filesHolding(dir: string, secret: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => fs.readFileSync(file, 'utf8').includes(secret));
}
