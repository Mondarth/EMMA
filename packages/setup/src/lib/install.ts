/**
 * Which packages on Foundry's listing EMMA offers to install anew. The listing gives each package's newest version
 * alone, without what it requires, and looking up every listed package's releases would take thousands of requests,
 * so it is filtered by what the listing says; choosing one then looks up its releases, and the plan takes the newest
 * version that fits, or says why none does. So a package whose newest version does not fit, though an older one would,
 * is not offered. Pure: it works on plain values only.
 */
import type { ListedPackage } from '../foundry/setup-game';
import type { Overview } from './overview';

/** What a package to install must fit. */
export interface InstallTarget {
  /** The Foundry build the plan has. */
  readonly core: string;
  /** The IDs of the game systems that stay installed. */
  readonly systems: readonly string[];
}

/**
 * A Foundry version as numbers: its generation, and its build if it names one.
 * @param version - Such as `14`, `14.368` or `13.351`
 * @returns The numbers, or `undefined` if it is none
 */
function parsed(version: string): { generation: number; build?: number } | undefined {
  const [generation, build] = version.split('.').map(Number);
  if (generation === undefined || Number.isNaN(generation)) return undefined;
  return build === undefined || Number.isNaN(build) ? { generation } : { generation, build };
}

/**
 * Whether a package's declared compatibility admits a Foundry build: from its minimum up, and up to its maximum, a
 * maximum naming only a generation admitting every build of it. What it does not declare is no limit.
 * @param compatibility - What it declares
 * @param core - The build
 * @returns Whether the build is admitted
 */
export function fitsCore(compatibility: ListedPackage['compatibility'], core: string): boolean {
  const at = parsed(core);
  if (at === undefined) return true;
  const position = at.generation * 1e6 + (at.build ?? 0);
  const minimum = compatibility.minimum === undefined ? undefined : parsed(compatibility.minimum);
  if (minimum !== undefined && position < minimum.generation * 1e6 + (minimum.build ?? 0)) return false;
  const maximum = compatibility.maximum === undefined ? undefined : parsed(compatibility.maximum);
  if (maximum === undefined) return true;
  return maximum.build === undefined
    ? at.generation <= maximum.generation
    : position <= maximum.generation * 1e6 + maximum.build;
}

/**
 * The packages on a listing that EMMA offers to install: those not installed, that the user may install, whose newest
 * version runs on the plan's Foundry build, and, for a module, that are for a game system that stays installed, or for
 * any.
 * @param listed - Foundry's listing
 * @param overview - The installation
 * @param target - What they must fit
 * @returns The packages, in the listing's order
 */
export function installable(
  listed: readonly ListedPackage[],
  overview: Overview,
  target: InstallTarget,
): ListedPackage[] {
  const installed = new Set([
    ...overview.systems.map(({ id }) => `system:${id}`),
    ...overview.modules.map(({ module: use }) => `module:${use.id}`),
  ]);
  return listed.filter(
    pkg =>
      !installed.has(`${pkg.type}:${pkg.id}`) &&
      !pkg.unowned &&
      fitsCore(pkg.compatibility, target.core) &&
      (pkg.systems.length === 0 || pkg.systems.some(system => target.systems.includes(system))),
  );
}

/**
 * The packages whose title, ID or author has some text, ignoring case.
 * @param packages - The packages
 * @param query - The text; every package for none
 * @returns The packages that have it
 */
export function matching(packages: readonly ListedPackage[], query: string): readonly ListedPackage[] {
  const text = query.trim().toLocaleLowerCase();
  if (text === '') return packages;
  return packages.filter(({ id, title, author }) =>
    [id, title, author ?? ''].some(value => value.toLocaleLowerCase().includes(text)),
  );
}
