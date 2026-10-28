/**
 * The Foundry VTT servers the user has activated EMMA on, and what that lets the extension do there. Pure: it works on
 * plain values only.
 *
 * Consent is given per server, its origin (scheme, host and port), and checked again on every visit. Firefox's match
 * patterns cannot name a port, so there one permission covers every port of a host; the extension still injects only
 * on the origins the user activated.
 */

/** A browser the extension is built for. */
export type Target = 'chromium' | 'firefox';

/** A Foundry VTT server the user has activated EMMA on. */
export interface Site {
  /** The server's origin, such as `https://foundry.example.com` or `http://localhost:30000`. */
  readonly origin: string;
  /** Whether EMMA opens on its setup screen by itself, or only when the user asks each time. */
  readonly auto: boolean;
}

/**
 * The origin of a page EMMA could run on.
 * @param url - The page's address
 * @returns Its origin, or `undefined` for a page that is not on an `http` or `https` server
 */
export function originOf(url: string | undefined): string | undefined {
  if (url === undefined || !URL.canParse(url)) return undefined;
  const { protocol, origin: server } = new URL(url);
  return protocol === 'http:' || protocol === 'https:' ? server : undefined;
}

/**
 * Whether a page is a Foundry VTT setup screen, by its address: `/setup`, after any route prefix the server has.
 * @param url - The page's address
 * @returns `true` for a setup screen's address
 */
export function isSetupPage(url: string | undefined): boolean {
  if (originOf(url) === undefined) return false;
  const path = new URL(url as string).pathname.replace(/\/+$/, '');
  return path === '/setup' || path.endsWith('/setup');
}

/**
 * The permission pattern that covers a server.
 * @param server - The server's origin
 * @param target - The browser
 * @returns The pattern: the origin's pages, on Firefox of every port of its host
 */
export function patternFor(server: string, target: Target): string {
  const { protocol, host, hostname } = new URL(server);
  return `${protocol}//${target === 'firefox' ? hostname : host}/*`;
}

/**
 * Remember a server, or change how EMMA opens there.
 * @param sites - The servers remembered
 * @param server - The server's origin
 * @param auto - Whether EMMA opens on its setup screen by itself
 * @returns The servers remembered, sorted by origin
 */
export function withSite(sites: readonly Site[], server: string, auto: boolean): Site[] {
  return [...sites.filter(site => site.origin !== server), { origin: server, auto }].sort((a, b) =>
    a.origin < b.origin ? -1 : 1,
  );
}

/**
 * Forget a server.
 * @param sites - The servers remembered
 * @param server - The server's origin
 * @returns The servers still remembered
 */
export function withoutSite(sites: readonly Site[], server: string): Site[] {
  return sites.filter(site => site.origin !== server);
}

/**
 * The permission patterns EMMA's loader runs on: those of the servers it opens on by itself.
 * @param sites - The servers remembered
 * @param target - The browser
 * @returns The patterns, each once
 */
export function autoPatterns(sites: readonly Site[], target: Target): string[] {
  return [...new Set(sites.filter(site => site.auto).map(site => patternFor(site.origin, target)))];
}

/**
 * Whether a permission pattern is still needed once a server is forgotten: on Firefox another port of the same host
 * may share it.
 * @param sites - The servers still remembered
 * @param pattern - The pattern of the server forgotten
 * @param target - The browser
 * @returns `true` if a server still remembered needs it
 */
export function patternInUse(sites: readonly Site[], pattern: string, target: Target): boolean {
  return sites.some(site => patternFor(site.origin, target) === pattern);
}

/**
 * Whether EMMA should open by itself on a page: a setup screen of a server the user activated it on, to open there by
 * itself.
 * @param sites - The servers remembered
 * @param url - The page's address
 * @returns `true` if EMMA should open there
 */
export function opensOn(sites: readonly Site[], url: string | undefined): boolean {
  const server = originOf(url);
  return isSetupPage(url) && sites.some(site => site.origin === server && site.auto);
}

/**
 * Read the servers remembered from storage, which anything may have written.
 * @param value - What the storage holds
 * @returns The servers, leaving out anything that is not one
 */
export function parseSites(value: unknown): Site[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): Site[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { origin: server, auto } = entry as Record<string, unknown>;
    return typeof server === 'string' && originOf(server) === server && typeof auto === 'boolean'
      ? [{ origin: server, auto }]
      : [];
  });
}
