/**
 * The only place the EMMA extension fetches: the releases of the installed game systems and modules, from EMMA's
 * package catalogue first, then from the installed manifests and the release lists of GitHub and GitLab, as the
 * module's version lookup does (see `packages/module/src/module/adapters/versions.ts`).
 *
 * The setup screen is an ordinary page, so the browser reads only what sends CORS headers: the catalogue, GitHub's and
 * GitLab's release lists, and manifests on sites that send them. Foundry's package listing and the manifests attached
 * to GitHub releases send none, so they are asked only through EMMA's proxy, when the EMMA extension is built with it;
 * without it, they are not asked at all. The Foundry build is kept as it is either way.
 *
 * The resolver and its sources are the ones the setup kit gives, from the installed EMMA module (see
 * `@mondarth/emma-core/setup-kit`).
 */
import type { CoreChannel, CoreRelease, PackageKey, PackageRef, Release, Universe } from '@mondarth/fvtt-resolver';
import type { Cache as SourceCache, LocalManifest } from '@mondarth/fvtt-resolver/sources';

import type { DefaultCatalogue } from '@mondarth/emma-core/default-catalogue';
import type { DefaultProxy } from '@mondarth/emma-core/default-proxy';
import type { SetupKit } from '@mondarth/emma-core/setup-kit';

import type { CoreBuild, InstalledManifests } from './setup-game';

/** The releases found, and how to load more as the resolver needs them. */
export interface ReleaseLookup {
  /** The installed Foundry build, and every release found of the installed systems and modules. */
  readonly universe: Universe;
  /** Load listed releases from their manifests, for `resolveInRounds`. */
  readonly load: (needs: readonly Release[]) => Promise<readonly Release[]>;
  /**
   * The packages the catalogue says cannot be had, archived or gone: only their installed releases are in the
   * universe, so they stay as they are.
   */
  readonly unavailable: ReadonlySet<PackageKey>;
  /** The packages whose releases could not all be listed, so may have newer versions not found. */
  readonly unreached: readonly PackageKey[];
}

/** How {@link lookUpReleases} fetches. */
export interface LookupOptions {
  /** The setup kit, from the installed EMMA module. */
  readonly kit: SetupKit;
  /** EMMA's package catalogue, with its key, or `null` for none, as in development builds. */
  readonly catalogue: DefaultCatalogue | null;
  /**
   * EMMA's version lookup proxy, with its key, or `null` for none, as in development builds. Everything but the
   * catalogue is fetched through it, so Foundry's package listing and the manifests attached to GitHub releases can be
   * read too.
   */
  readonly proxy: DefaultProxy | null;
  /**
   * The EMMA extension's version, named to the proxy, in an `X-EMMA-Version` header, and to the catalogue, so their
   * logs can say which version asks for what; `null` for none.
   */
  readonly clientVersion?: string | null;
  /** Fetches; the browser's by default. */
  readonly fetch?: typeof globalThis.fetch;
}

/** The most requests one lookup makes, to stay within GitHub's limit of 60 an hour without a proxy. */
const MAX_REQUESTS = 300;

const CHANNELS: readonly CoreChannel[] = ['stable', 'testing', 'development', 'prototype'];

/**
 * Hosts that send no CORS headers, so a browser cannot read what they answer: GitHub's release downloads and Foundry's
 * package listing. Without a proxy they are not asked at all, as each refused request also puts an error in the
 * console.
 */
const NO_CORS_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'r2.foundryvtt.com',
  'foundryvtt.com',
]);

// Kept while the setup screen is open, so reading the installation again does not fetch it all again: one for each
// kit, as a module updated meanwhile gives a new one.
const sessionCaches = new WeakMap<SetupKit, SourceCache>();

/**
 * The session's cache for a kit.
 * @param kit - The kit
 * @returns Its cache, made the first time
 */
function sessionCache(kit: SetupKit): SourceCache {
  const cache = sessionCaches.get(kit) ?? kit.sources.memoryCache();
  sessionCaches.set(kit, cache);
  return cache;
}

/**
 * Send requests directly, refusing those a browser could not read the answer to.
 * @param send - The fetch to send them with
 * @returns A fetch that refuses hosts that send no CORS headers
 */
function direct(send: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    return NO_CORS_HOSTS.has(new URL(new Request(input).url).hostname)
      ? Promise.reject(new TypeError('Not fetched: the site sends no CORS headers'))
      : send(input, init);
  };
}

/**
 * Send requests with headers of the proxy's: its API key, and the EMMA extension's version.
 * @param send - The fetch to send them with
 * @param extra - The headers, each left out when `null`
 * @returns A fetch that adds them to every request
 */
function withHeaders(
  send: typeof globalThis.fetch,
  extra: Readonly<Record<string, string | null>>,
): typeof globalThis.fetch {
  const set = Object.entries(extra).filter((entry): entry is [string, string] => entry[1] !== null);
  return (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [name, value] of set) headers.set(name, value);
    return send(input, { ...init, headers });
  };
}

/**
 * The installed Foundry build, as the resolver names it.
 * @param build - The build
 * @returns The core release
 */
function coreRelease(build: CoreBuild): CoreRelease {
  return {
    version: build.version,
    generation: build.generation,
    channel: CHANNELS.find(channel => channel === build.channel) ?? 'stable',
  };
}

/**
 * Look up every release of the installed systems and modules.
 * @param installed - The installed packages' manifests, and the Foundry build
 * @param options - How to fetch
 * @returns What was found
 */
export async function lookUpReleases(installed: InstalledManifests, options: LookupOptions): Promise<ReleaseLookup> {
  const { kit, catalogue, proxy, clientVersion = null } = options;
  const { packageKey, sameVersion } = kit.resolver;
  const {
    catalogueSource,
    foundryIndexSource,
    githubSource,
    gitlabSource,
    httpClient,
    localSource,
    manifestUrlSource,
    proxiedFetch,
    sourceSet,
  } = kit.sources;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const http = httpClient({
    fetch:
      proxy === null
        ? direct(send)
        : proxiedFetch(
            withHeaders(send, {
              'X-API-Key': proxy.key,
              'X-EMMA-Version': clientVersion === null ? null : `extension-${clientVersion}`,
            }),
            proxy.url,
          ),
    cache: sessionCache(kit),
    budget: { maxRequests: MAX_REQUESTS },
  });
  const core = coreRelease(installed.core);
  const manifests: LocalManifest[] = installed.manifests.map(manifest => ({
    json: manifest.json,
    origin: manifest.origin,
    type: manifest.type,
  }));
  const local = localSource(manifests);
  const set = sourceSet({
    // The installed releases come first, as they are loaded with everything their manifests declare, and then the
    // manifests the packages declare, which give their newest versions loaded too. Foundry's package listing, through
    // the proxy only, and GitHub's and GitLab's release lists give the rest. Without the proxy, a version known only
    // from a release list has no core compatibility, as a browser cannot read its manifest, so cannot be placed.
    sources: [
      local,
      manifestUrlSource(http),
      ...(proxy === null ? [] : [foundryIndexSource(http)]),
      githubSource(http),
      gitlabSource(http),
    ],
    http,
    // Only the installed build, which is kept as it is.
    core: [core],
    manifests: Object.fromEntries(
      installed.manifests.flatMap(({ type, id, manifest }) =>
        manifest === undefined ? [] : [[packageKey({ type, id }), [manifest]]],
      ),
    ),
    // Asked directly, not through the proxy, as it sends CORS headers.
    ...(catalogue !== null && {
      catalogue: catalogueSource({
        ...catalogue,
        fetch: send,
        ...(clientVersion !== null && { client: `EMMA-extension/${clientVersion}` }),
      }),
    }),
  });

  const refs: PackageRef[] = installed.manifests.map(({ type, id }) => ({ type, id }));
  const { releases } = await set.universe(refs);
  const unavailable = new Set(set.unavailable().map(({ package: ref }) => packageKey(ref)));
  // The catalogue gives a package it holds without the local source, so without a version only installed here, and
  // nothing at all of a package that cannot be had: the installed release is added from its manifest.
  const missing = await Promise.all(
    installed.manifests.map(async ({ type, id, version }) => {
      const key = packageKey({ type, id });
      const given = releases.some(
        release => packageKey(release.package) === key && sameVersion(release.version, version),
      );
      if (given) return [];
      const read = await local.releases({ type, id });
      return read.ok ? read.value : [];
    }),
  );
  const failed = new Set(
    set
      .gaps()
      .filter(gap => gap.version === undefined)
      .map(gap => gap.package),
  );
  return {
    universe: { core: [core], releases: [...releases, ...missing.flat()] },
    load: needs => set.load(needs),
    unavailable,
    unreached: refs.map(packageKey).filter(key => failed.has(key)),
  };
}
