/**
 * Builds EMMA's package catalogue into a bundle: run by the Vite configurations of the module and of the EMMA extension,
 * under Node.
 *
 * - **The module** asks the catalogue with a key of its own, which the catalogue lets look up versions alone. It is
 *   built in as `__EMMA_DEFAULT_CATALOGUE__`, the URL and key obscured ({@link defaultCatalogueDefine}; see
 *   `src/default-catalogue.ts`).
 * - **The EMMA extension** asks it as its signed-in user, with their token, and ships no key: its builds take the
 *   catalogue's URL alone, as `__EMMA_CATALOGUE_URL__` ({@link catalogueUrlDefine}), and the URL of Mondarth's
 *   accounts, where its user signs in, as `__EMMA_ACCOUNTS_URL__` ({@link accountsUrlDefine}).
 */
import { obscure } from '../src/obscure.ts';

/** The variable the catalogue's URL is taken from: a repository variable, in a release. */
export const CATALOGUE_URL_VARIABLE = 'EMMA_DEFAULT_CATALOGUE_URL';

/**
 * The variable a development build takes a catalogue of the developer's own from, such as a local catalogue's
 * `http://localhost:5173/`: `http` is allowed, and it takes the place of {@link CATALOGUE_URL_VARIABLE}. A release
 * refuses to run while it is set (see `release-defaults.ts`).
 */
export const DEV_CATALOGUE_VARIABLE = 'EMMA_DEV_CATALOGUE_URL';

/** The variable the module's key is taken from: a repository secret, in a release. */
export const MODULE_KEY_VARIABLE = 'EMMA_MODULE_CATALOGUE_KEY';

/**
 * The catalogue's URL, if one is set.
 * @param env - The environment the build runs in
 * @returns The URL, or `undefined` without one
 * @throws {Error} for a URL that is not https
 */
function catalogueUrl(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const url = env[CATALOGUE_URL_VARIABLE] || undefined;
  if (url !== undefined && (!URL.canParse(url) || new URL(url).protocol !== 'https:'))
    throw new Error(`${CATALOGUE_URL_VARIABLE} must be an https URL, such as https://catalogue.example.com/`);
  return url;
}

/**
 * The value of the module's `__EMMA_DEFAULT_CATALOGUE__`.
 * @param env - The environment the build runs in
 * @returns JSON: the catalogue's URL and the module's key, obscured, or `null` without them
 * @throws {Error} for only one of them, or a URL that is not https, rather than build a broken release
 */
export function defaultCatalogueDefine(env: Readonly<Record<string, string | undefined>>): string {
  const url = catalogueUrl(env);
  const key = env[MODULE_KEY_VARIABLE] || undefined;
  if (url === undefined && key === undefined) return 'null';
  if (url === undefined) throw new Error(`${MODULE_KEY_VARIABLE} is set without ${CATALOGUE_URL_VARIABLE}`);
  if (key === undefined) throw new Error(`${CATALOGUE_URL_VARIABLE} is set without ${MODULE_KEY_VARIABLE}`);
  return JSON.stringify({ url: obscure(url), key: obscure(key) });
}

/**
 * The value of the EMMA extension's `__EMMA_CATALOGUE_URL__`: the catalogue's URL, which is no secret; a development
 * catalogue's, if one is set.
 * @param env - The environment the build runs in
 * @returns JSON: the URL, or `null` without one
 * @throws {Error} for a URL that is not https, or a development one that is neither http nor https
 */
export function catalogueUrlDefine(env: Readonly<Record<string, string | undefined>>): string {
  const dev = env[DEV_CATALOGUE_VARIABLE] || undefined;
  if (dev !== undefined) {
    if (!URL.canParse(dev) || !['http:', 'https:'].includes(new URL(dev).protocol))
      throw new Error(`${DEV_CATALOGUE_VARIABLE} must be an http or https URL, such as http://localhost:5173/`);
    return JSON.stringify(dev);
  }
  return JSON.stringify(catalogueUrl(env) ?? null);
}

/** The variable the URL of Mondarth's accounts is taken from: a repository variable, in a release. */
export const ACCOUNTS_URL_VARIABLE = 'EMMA_ACCOUNTS_URL';

/**
 * The variable a development build takes accounts of the developer's own from, such as local accounts'
 * `http://localhost:5174/`: `http` is allowed, and it takes the place of {@link ACCOUNTS_URL_VARIABLE}. A release
 * refuses to run while it is set (see `release-defaults.ts`).
 */
export const DEV_ACCOUNTS_VARIABLE = 'EMMA_DEV_ACCOUNTS_URL';

/**
 * The value of the EMMA extension's `__EMMA_ACCOUNTS_URL__`: the URL of Mondarth's accounts, where the extension's
 * user signs in, and finds their profile and subscription, which is no secret; a development build's own if one is
 * set.
 * @param env - The environment the build runs in
 * @returns JSON: the URL, or `null` without one, when the extension signs in at the catalogue
 * @throws {Error} for a URL that is not https, or not http or https in development, rather than build a broken release
 */
export function accountsUrlDefine(env: Readonly<Record<string, string | undefined>>): string {
  const dev = env[DEV_ACCOUNTS_VARIABLE] || undefined;
  if (dev !== undefined) {
    if (!URL.canParse(dev) || !['http:', 'https:'].includes(new URL(dev).protocol))
      throw new Error(`${DEV_ACCOUNTS_VARIABLE} must be an http or https URL, such as http://localhost:5174/`);
    return JSON.stringify(dev);
  }
  const url = env[ACCOUNTS_URL_VARIABLE] || undefined;
  if (url !== undefined && (!URL.canParse(url) || new URL(url).protocol !== 'https:'))
    throw new Error(`${ACCOUNTS_URL_VARIABLE} must be an https URL, such as https://accounts.example.com/`);
  return JSON.stringify(url ?? null);
}
