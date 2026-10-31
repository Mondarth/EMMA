/**
 * The setup kit: the code the EMMA extension on the setup screen takes from the installed EMMA module, rather than
 * carry its own copy: `@mondarth/fvtt-resolver` and its release sources, which the module has anyway, and how the module
 * badges a version, so that both judge versions alike. The module builds it as `dist/emma-setup-kit.js`, an ES module, and names it in its manifest's `flags` (see
 * {@link SetupKitFlag}), so that the EMMA extension can tell whether it fits before it imports anything.
 *
 * The kit's API version, `<major>.<minor>`, is what each side was built with ({@link SETUP_KIT_API}). The minor goes up
 * when the kit gives more, which an EMMA extension built before then does not use; the major when the kit stops giving
 * something, or gives it with a different shape, as a resolver release that changes what the EMMA extension calls
 * would. See {@link kitFit}.
 */
import type * as Resolver from '@mondarth/fvtt-resolver';
import type * as Sources from '@mondarth/fvtt-resolver/sources';

/** The kit's API version this build has, `<major>.<minor>`. */
export const SETUP_KIT_API = '1.0';

/** Where in the EMMA module's manifest's `flags` the kit is named. */
export const SETUP_KIT_FLAG = 'setupKit';

/** How the EMMA module's manifest names the kit, in `flags.setupKit`. */
export interface SetupKitFlag {
  /** The kit's API version. */
  readonly api: string;
  /** The kit's path in the module, such as `dist/emma-setup-kit.js`. */
  readonly path: string;
}

/** What the kit gives of `@mondarth/fvtt-resolver`. */
export type KitResolver = Pick<
  typeof Resolver,
  | 'CORE'
  | 'AVAILABILITY'
  | 'check'
  | 'coreAvailability'
  | 'isNewerVersion'
  | 'isUnavailable'
  | 'looksLikePrerelease'
  | 'packageKey'
  | 'resolveInRounds'
  | 'sameVersion'
>;

/** What the kit gives of `@mondarth/fvtt-resolver/sources`. */
export type KitSources = Pick<
  typeof Sources,
  | 'catalogueSource'
  | 'foundryCoreReleases'
  | 'foundryIndexSource'
  | 'githubSource'
  | 'gitlabSource'
  | 'httpClient'
  | 'localSource'
  | 'manifestUrlSource'
  | 'memoryCache'
  | 'proxiedFetch'
  | 'sourceSet'
>;

/** A version's badge, as the EMMA module shows it: Foundry's colours, icon and explanation. */
export interface KitBadge {
  /** The badge's colour: `success` (verified), `neutral`, `warning` or `error`. */
  readonly type: 'success' | 'warning' | 'neutral' | 'error';
  /** Font Awesome classes for the badge's icon. */
  readonly icon: string;
  /** Foundry's explanation, as HTML for a tooltip; the tooltip manager cleans it before showing it. */
  readonly tooltip: string;
  /** The same explanation as plain text, for screen readers. */
  readonly text: string;
}

/** What the kit gives of how the EMMA module badges a version. */
export interface KitBadges {
  /**
   * The badge of a release with the verdict EMMA's checks give it, rather than the one Foundry would: Foundry's own
   * `getVersionBadge`, given that verdict, so the colours and the explanation are Foundry's. Needs Foundry's client.
   * @param checked - What checking found of the release
   * @param setup - What checking found of every package in the same setup, to name those the release does not suit
   * @returns The badge, or `null` if Foundry gives none
   */
  readonly releaseBadge: (checked: Resolver.ReleaseCheck, setup: readonly Resolver.ReleaseCheck[]) => KitBadge | null;
}

/** The kit: the default export of `dist/emma-setup-kit.js`. */
export interface SetupKit {
  /** The kit's API version, which the EMMA extension checks again once it has imported it. */
  readonly api: string;
  readonly resolver: KitResolver;
  readonly sources: KitSources;
  readonly badges: KitBadges;
}

/**
 * Whether a kit fits an EMMA extension: `fits`, or which of the two to update so that it does.
 * - `module-too-old`: the kit gives less than the EMMA extension needs, an older major or minor, or it says nothing
 *   readable of its version;
 * - `extension-too-old`: the kit is of a newer major, which the EMMA extension was built before.
 */
export type KitFit = 'fits' | 'module-too-old' | 'extension-too-old';

/**
 * Whether a kit of one API version fits an EMMA extension built for another.
 * @param kit - The kit's API version, as its manifest or the kit itself says
 * @param needed - The API version the EMMA extension was built with; this build's own unless given
 * @returns Whether it fits, or which to update
 */
export function kitFit(kit: unknown, needed: string = SETUP_KIT_API): KitFit {
  const have = apiVersion(kit);
  const want = apiVersion(needed);
  if (have === undefined || want === undefined) return 'module-too-old';
  if (have.major > want.major) return 'extension-too-old';
  if (have.major < want.major || have.minor < want.minor) return 'module-too-old';
  return 'fits';
}

/**
 * Read an API version.
 * @param value - Such as `1.0`
 * @returns Its major and minor, or `undefined` if it is not one
 */
function apiVersion(value: unknown): { major: number; minor: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+)\.(\d+)$/.exec(value);
  return match === null ? undefined : { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * The kit an EMMA module's manifest names.
 * @param flags - The manifest's `flags`
 * @returns The kit, or `undefined` if it names none, as a module from before there was a kit
 */
export function kitFlag(flags: unknown): SetupKitFlag | undefined {
  if (typeof flags !== 'object' || flags === null) return undefined;
  const flag: unknown = Reflect.get(flags, SETUP_KIT_FLAG);
  if (typeof flag !== 'object' || flag === null) return undefined;
  const { api, path } = flag as Record<string, unknown>;
  return typeof api === 'string' && typeof path === 'string' && path !== '' ? { api, path } : undefined;
}
