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
import type { PendingPackage } from './tree';
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
  /** The tags turned off, {@link UNTAGGED} among them for packages without tags: a package shows if any of its own is on. */
  readonly offTags: readonly string[];
}

/** What is hidden unless the user says otherwise: every tag is on. */
export const DEFAULT_FILTERS: InstallFilters = { hideBehind: true, showUnowned: false, offTags: [] };

/** The tag filter's name for packages the listing gives no tags. */
export const UNTAGGED = '';

/**
 * A package's tags, as the tag filter has them.
 * @param pkg - The package
 * @returns Its tags, or {@link UNTAGGED} alone if it has none
 */
function tagsOf(pkg: ListedPackage): readonly string[] {
  return pkg.tags === undefined || pkg.tags.length === 0 ? [UNTAGGED] : pkg.tags;
}

/**
 * The tags among some packages, by name, with {@link UNTAGGED} last if any has none.
 * @param packages - The packages
 * @returns The tags
 */
export function tagsAmong(packages: readonly ListedPackage[]): string[] {
  const tags = [...new Set(packages.flatMap(tagsOf))];
  return [
    ...tags.filter(tag => tag !== UNTAGGED).sort((a, b) => a.localeCompare(b)),
    ...tags.filter(tag => tag === UNTAGGED),
  ];
}

/**
 * The packages with a tag that is on.
 * @param packages - The packages
 * @param offTags - The tags turned off
 * @returns Those with any tag on, all of them while none is off
 */
export function withTags(packages: readonly ListedPackage[], offTags: readonly string[]): readonly ListedPackage[] {
  if (offTags.length === 0) return packages;
  return packages.filter(pkg => tagsOf(pkg).some(tag => !offTags.includes(tag)));
}

/**
 * Toggle a tag, as a click on its badge does. A plain click turns it on or off. A shift-click turns every other tag
 * off and toggles it as a plain click does: so on a tag that is on it turns every tag off, and on one that is off it
 * leaves that one alone on.
 * @param tags - Every tag shown
 * @param offTags - The tags turned off
 * @param tag - The tag clicked
 * @param alone - Whether shift was held
 * @returns The tags turned off after
 */
export function toggleTag(tags: readonly string[], offTags: readonly string[], tag: string, alone: boolean): string[] {
  const on = !offTags.includes(tag);
  const others = alone ? tags.filter(other => other !== tag) : offTags.filter(other => other !== tag);
  return on ? [...others, tag] : others;
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
 * The packages a plan installs anew, as the installation tree shows them, pending: each a change of the plan to a
 * package not installed, with the game systems a module is for, as Foundry's listing of modules says, if read.
 * @param changes - The plan's changes, each with the version installed, if any
 * @param titleOf - A package's title, by its key
 * @param listing - Foundry's listing of modules, if read
 * @returns The packages
 */
export function pendingPackages(
  changes: readonly { readonly key: string; readonly installed?: string; readonly chosen: string }[],
  titleOf: (key: string) => string,
  listing: readonly ListedPackage[],
): PendingPackage[] {
  const systems = new Map(listing.map(pkg => [`module:${pkg.id}`, pkg.systems]));
  return changes
    .filter(({ key, installed, chosen }) => key !== 'core' && installed === undefined && chosen !== UNINSTALL)
    .map(({ key, chosen }) => ({ key, title: titleOf(key), version: chosen, systems: systems.get(key) ?? [] }));
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
