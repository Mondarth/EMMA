/**
 * Builds the default package catalogue into a release, as the default proxy is (see `default-proxy.ts`). The release
 * workflow sets `EMMA_DEFAULT_CATALOGUE_URL` (a repository variable) and `EMMA_DEFAULT_CATALOGUE_KEY` (a secret); Vite
 * puts them, obscured, in `__EMMA_DEFAULT_CATALOGUE__`. A build with neither, as for development and CI, has no
 * default catalogue. See docs/developers/default-proxy.md.
 */
import { obscure } from '../../src/module/lib/obscure.ts';

/**
 * The value of `__EMMA_DEFAULT_CATALOGUE__` for a build.
 * @param env - The environment the build runs in
 * @returns JSON: the catalogue's URL and key, obscured, or `null` without them
 * @throws Error for only one of them, or a URL that is not https, rather than build a broken release
 */
export function defaultCatalogueDefine(env: Readonly<Record<string, string | undefined>>): string {
  const url = env['EMMA_DEFAULT_CATALOGUE_URL'] || undefined;
  const key = env['EMMA_DEFAULT_CATALOGUE_KEY'] || undefined;
  if (url === undefined && key === undefined) return 'null';
  if (url === undefined) throw new Error('EMMA_DEFAULT_CATALOGUE_KEY is set without EMMA_DEFAULT_CATALOGUE_URL');
  if (key === undefined) throw new Error('EMMA_DEFAULT_CATALOGUE_URL is set without EMMA_DEFAULT_CATALOGUE_KEY');
  if (!URL.canParse(url) || new URL(url).protocol !== 'https:')
    throw new Error('EMMA_DEFAULT_CATALOGUE_URL must be an https URL, such as https://catalogue.example.com/');
  return JSON.stringify({ url: obscure(url), key: obscure(key) });
}
