/**
 * The packages the Install sections offer: Foundry's listing, as EMMA's package catalogue keeps it (`GET
 * /api/v2/listing`), rather than as the server reads it from Foundry each session. The catalogue gives it with an ETag,
 * which the browser's own cache sends again, so a listing that has not changed is not fetched again.
 *
 * Which premium packages the user owns is the one thing only Foundry knows: it is read through `game.getPackages`, and
 * kept in local storage for a week (see `preferences.ts`), as a package once owned stays owned. A package bought since
 * shows as not owned until then; one no longer owned is refused by Foundry when it is installed.
 *
 * The catalogue's client is the one the setup kit gives, from the installed EMMA module.
 */
import type { ListedPackage as CatalogueListed } from '@mondarth/fvtt-package-catalogue-contract';

import type { DefaultCatalogue } from '@mondarth/emma-core/default-catalogue';
import type { SetupKit } from '@mondarth/emma-core/setup-kit';

import { fitsCore } from '../lib/install';

import type { ListedPackage } from './setup-game';
import { plainText, sorted } from './setup-game';

/** How {@link readListing} asks. */
export interface ListingOptions {
  /** The setup kit, from the installed EMMA module. */
  readonly kit: SetupKit;
  /** EMMA's package catalogue, with its key, or `null` for none, as in development builds. */
  readonly catalogue: DefaultCatalogue | null;
  /** The EMMA extension's version, named to the catalogue; `null` for none. */
  readonly clientVersion?: string | null;
  /** Fetches; the browser's by default. */
  readonly fetch?: typeof globalThis.fetch;
  /** The installed Foundry build, whose line of each package's versions is offered. */
  readonly core: string;
  /** The keys of the premium packages of the type the user owns. */
  readonly owned: () => Promise<ReadonlySet<string>>;
}

/**
 * Read Foundry's listing of the game systems or modules that may be installed, from the catalogue.
 * @param type - Which
 * @param options - How to ask
 * @returns The packages, sorted by title
 * @throws {Error} If there is no catalogue, or it cannot be reached
 */
export async function readListing(type: 'module' | 'system', options: ListingOptions): Promise<ListedPackage[]> {
  const { kit, catalogue, clientVersion = null, core } = options;
  if (catalogue === null) throw new Error('This build of EMMA has no package catalogue');
  const source = kit.sources.catalogueSource({
    ...catalogue,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    ...(clientVersion !== null && { client: `EMMA-extension/${clientVersion}` }),
  });
  const read = await source.listing({ type });
  if (!read.ok) throw new Error(`The catalogue's listing could not be read: ${read.gap.reason}`);
  /* v8 ignore next -- asked without an ETag, it is never answered 304 */
  if (read.value.notModified) throw new Error("The catalogue's listing was answered 304 to no ETag");
  const { packages } = read.value.value;
  const owned = packages.some(({ premium }) => premium) ? await options.owned() : new Set<string>();
  return sorted(packages.map(pkg => toListed(pkg, type, core, owned)));
}

/**
 * Describe a package on the catalogue's listing as the Install sections show it.
 * @param pkg - The package
 * @param type - The listing's type
 * @param core - The installed Foundry build
 * @param owned - The keys of the premium packages the user owns
 * @returns The package, or `undefined` if the listing gives no version of it
 */
function toListed(
  pkg: CatalogueListed,
  type: 'module' | 'system',
  core: string,
  owned: ReadonlySet<string>,
): ListedPackage | undefined {
  // The listing gives a version for each line of builds, oldest first; Foundry offers the newest that runs on the
  // build installed, or else the newest.
  const declared = pkg.versions.map(entry => ({
    listed: entry,
    compatibility: {
      ...(entry.minimum !== null && { minimum: entry.minimum }),
      ...(entry.verified !== null && { verified: entry.verified }),
      ...(entry.maximum !== null && { maximum: entry.maximum }),
    },
  }));
  const chosen = declared.findLast(entry => fitsCore(entry.compatibility, core)) ?? declared.at(-1);
  if (chosen === undefined) return undefined;
  const { listed, compatibility } = chosen;
  const key = `${pkg.package.type}:${pkg.package.id}`;
  const description = pkg.summary === null ? '' : plainText(pkg.summary);
  const web = (url: string | null): url is string => url !== null && /^https?:\/\//i.test(url);
  return {
    type,
    id: pkg.package.id,
    title: pkg.title,
    version: listed.version,
    ...(pkg.author !== null && pkg.author !== '' && { author: pkg.author, authors: [pkg.author] }),
    compatibility,
    systems: type === 'module' ? pkg.systems : [],
    unowned: pkg.premium && !owned.has(key),
    ...(description !== '' && { description }),
    ...(web(pkg.url) && { url: pkg.url }),
    ...(web(listed.manifest) && { manifest: listed.manifest }),
    ...(pkg.tags.length > 0 && { tags: pkg.tags }),
    ...(pkg.premium && { premium: true as const }),
    ...(pkg.exclusive && { exclusive: true as const }),
  };
}
