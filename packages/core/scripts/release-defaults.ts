/**
 * Makes sure a release builds in EMMA's package catalogue and version lookup proxy: the module's and the browser
 * extension's release scripts check for them before they change anything, as a build without them still succeeds, and
 * would ship without either.
 */

/** The variables a build takes the catalogue and the proxy from (see `default-catalogue-define.ts`). */
export const RELEASE_DEFAULTS = [
  'EMMA_DEFAULT_CATALOGUE_URL',
  'EMMA_DEFAULT_CATALOGUE_KEY',
  'EMMA_DEFAULT_PROXY_URL',
  'EMMA_DEFAULT_PROXY_KEY',
] as const;

/**
 * Refuse to release without the catalogue and the proxy.
 * @param env - The environment the release runs in
 * @throws Error naming each variable not set
 */
export function requireReleaseDefaults(env: Readonly<Record<string, string | undefined>>): void {
  const missing = RELEASE_DEFAULTS.filter(name => !env[name]);
  if (missing.length === 0) return;
  throw new Error(
    `A release must build in EMMA's package catalogue and version lookup proxy, but ${missing.join(', ')} ` +
      `${missing.length === 1 ? 'is' : 'are'} not set`,
  );
}
