/**
 * Makes sure a release builds in EMMA's package catalogue: the module's and the browser extension's release scripts
 * check for it before they change anything, as a build without it still succeeds, and would ship without one.
 */
import { CATALOGUE_URL_VARIABLE, MODULE_KEY_VARIABLE } from './default-catalogue-define.ts';

/** The variables the module's build takes the catalogue from: its URL, and the module's key. */
export const MODULE_RELEASE_DEFAULTS = [CATALOGUE_URL_VARIABLE, MODULE_KEY_VARIABLE] as const;

/** The variables the EMMA extension's build takes the catalogue from: its URL alone, as it ships no key. */
export const EXTENSION_RELEASE_DEFAULTS = [CATALOGUE_URL_VARIABLE] as const;

/**
 * Refuse to release without the catalogue.
 * @param env - The environment the release runs in
 * @param names - The variables the release needs
 * @throws {Error} naming each variable not set
 */
export function requireReleaseDefaults(
  env: Readonly<Record<string, string | undefined>>,
  names: readonly string[],
): void {
  const missing = names.filter(name => !env[name]);
  if (missing.length === 0) return;
  throw new Error(
    `A release must build in EMMA's package catalogue, but ${missing.join(', ')} ` +
      `${missing.length === 1 ? 'is' : 'are'} not set`,
  );
}
