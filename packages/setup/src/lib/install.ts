/**
 * Which packages on Foundry's listing EMMA offers to install anew. The listing gives each package's newest version
 * alone, without what it requires, and looking up every listed package's releases would take thousands of requests,
 * so it is filtered by what the listing says; choosing one then looks up its releases, and the plan takes the newest
 * version that fits, or says why none does. So a package whose newest version does not fit, though an older one would,
 * is not offered. Many old packages declare only a minimum, so seem to run on every build since: those made for a
 * generation more than one behind the plan's build are hidden unless the user asks. Pure: it works on plain values
 * only.
 */
import type { ListedPackage } from '../foundry/setup-game';
import { format, localize } from './i18n';
import type { Overview } from './overview';
import { UNINSTALL } from './plans';

/** What a package to install must fit. */
export interface InstallTarget {
  /** The Foundry build the plan has. */
  readonly core: string;
  /** The IDs of the game systems that stay installed. */
  readonly systems: readonly string[];
}

/** How the user narrows what is offered. */
export interface InstallFilters {
  /** Whether to hide what was made for a Foundry generation more than one behind the plan's build. */
  readonly hideBehind: boolean;
  /** Whether to show premium packages the user does not own, which cannot be added. */
  readonly showUnowned: boolean;
}

/** What is hidden unless the user says otherwise. */
export const DEFAULT_FILTERS: InstallFilters = { hideBehind: true, showUnowned: false };

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
 * Whether a package was made for a Foundry generation more than one behind a build: the generation it is verified on,
 * or, if it gives none, its minimum. One that declares a maximum is judged by {@link fitsCore} instead, and one that
 * declares neither is not known to be behind.
 * @param compatibility - What it declares
 * @param core - The build
 * @returns Whether it is behind
 */
export function isBehind(compatibility: ListedPackage['compatibility'], core: string): boolean {
  const at = parsed(core);
  const made = compatibility.verified ?? compatibility.minimum;
  const of = made === undefined ? undefined : parsed(made);
  return (
    at !== undefined && of !== undefined && compatibility.maximum === undefined && of.generation < at.generation - 1
  );
}

/**
 * The game systems a plan leaves installed: those installed that it does not uninstall, and those it installs.
 * @param overview - The installation
 * @param picks - The plan's choices, by package key
 * @returns Their IDs
 */
export function keptSystems(overview: Overview, picks: readonly (readonly [string, string])[]): string[] {
  const chosen = new Map(picks);
  const installed = overview.systems.map(({ id }) => id).filter(id => chosen.get(`system:${id}`) !== UNINSTALL);
  const added = picks
    .filter(([key, version]) => key.startsWith('system:') && version !== UNINSTALL)
    .map(([key]) => key.slice('system:'.length))
    .filter(id => !installed.includes(id));
  return [...installed, ...added];
}

/**
 * The packages on a listing that EMMA offers to install: those not installed, whose newest version runs on the plan's
 * Foundry build, and, for a module, that are for a game system that stays installed, or for any; as the user narrows
 * them, without those made for a generation more than one behind, and with premium packages they do not own, which
 * are shown but cannot be added.
 * @param listed - Foundry's listing
 * @param overview - The installation
 * @param target - What they must fit
 * @param filters - How the user narrows them
 * @returns The packages, in the listing's order
 */
export function installable(
  listed: readonly ListedPackage[],
  overview: Overview,
  target: InstallTarget,
  filters: InstallFilters = DEFAULT_FILTERS,
): ListedPackage[] {
  const installed = new Set([
    ...overview.systems.map(({ id }) => `system:${id}`),
    ...overview.modules.map(({ module: use }) => `module:${use.id}`),
  ]);
  return listed.filter(
    pkg =>
      !installed.has(`${pkg.type}:${pkg.id}`) &&
      (filters.showUnowned || !pkg.unowned) &&
      fitsCore(pkg.compatibility, target.core) &&
      !(filters.hideBehind && isBehind(pkg.compatibility, target.core)) &&
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

/**
 * The Foundry builds a package declares it runs on, in words.
 * @param compatibility - What it declares
 * @returns Such as `minimum 13, verified 14.368`, or that it declares none
 */
export function compatibilityText(compatibility: ListedPackage['compatibility']): string {
  const parts = (['minimum', 'verified', 'maximum'] as const).flatMap(name => {
    const version = compatibility[name];
    return version === undefined ? [] : [format(`Install.${name}`, { version })];
  });
  return parts.length === 0 ? localize('Install.NoCompatibility') : parts.join(', ');
}

/**
 * A tag of Foundry's listing in words, as Foundry's Install dialog falls back to for a tag it has no translation of.
 * @param tag - Such as `audio-sound`
 * @returns Such as `Audio Sound`
 */
export function tagText(tag: string): string {
  return tag
    .split('-')
    .map(word => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ');
}
