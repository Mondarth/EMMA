/**
 * Finds the setup kit in the installed EMMA module, and imports it (see `@mondarth/emma-core/setup-kit`). The EMMA
 * extension carries no resolver of its own: its updates need the EMMA module, at a version whose kit fits the
 * extension. Which version that is, is checked from the module's manifest before anything is imported, and again from
 * the kit itself once it is, so a kit that does not fit is never used.
 *
 * Foundry serves an installed module's files on the setup screen, as in a world, so the kit is imported from the
 * server's own `modules/mondarth-emma/` path.
 */
import type { SetupKit } from '@mondarth/emma-core/setup-kit';
import { kitFit, kitFlag } from '@mondarth/emma-core/setup-kit';

import type { InstalledManifests } from './setup-game';

/** The EMMA module's ID. */
export const EMMA_MODULE_ID = 'mondarth-emma';

/** Where the EMMA module's manifest is published, to install or update it from. */
export const EMMA_MANIFEST = 'https://raw.githubusercontent.com/Mondarth/EMMA/main/packages/module/module.json';

/** Where the browser extension's releases are, to update it from. */
export const EXTENSION_RELEASES = 'https://github.com/Mondarth/EMMA/releases?q=extension&expanded=true';

/**
 * Why there is no kit to use:
 * - `missing`: the EMMA module is not installed;
 * - `module-too-old`: it is, at a version without a kit, or whose kit gives less than the extension needs;
 * - `extension-too-old`: its kit is newer than the extension was built for.
 */
export type KitProblem =
  | { readonly reason: 'missing' }
  | { readonly reason: 'module-too-old' | 'extension-too-old'; readonly version: string };

/** Where the kit is. */
export interface KitFound {
  /** Its URL on the server. */
  readonly url: string;
  /** The EMMA module's version. */
  readonly version: string;
}

/** Where the kit is, or why there is none to use. */
export type KitLocation = ({ readonly ok: true } & KitFound) | { readonly ok: false; readonly problem: KitProblem };

/** Thrown when there is no kit to use, saying why. */
export class KitUnavailable extends Error {
  readonly problem: KitProblem;

  /**
   * @param problem - Why
   */
  constructor(problem: KitProblem) {
    super(`EMMA's setup kit cannot be used: ${problem.reason}`);
    this.name = 'KitUnavailable';
    this.problem = problem;
  }
}

/**
 * Find the kit in the installed EMMA module.
 * @param installed - The installed packages' manifests
 * @param route - The server's URL for a path under its root, as `foundry.utils.getRoute` gives it
 * @returns Where the kit is, or why there is none to use
 */
export function locateKit(installed: InstalledManifests, route: (path: string) => string): KitLocation {
  const emma = installed.manifests.find(({ type, id }) => type === 'module' && id === EMMA_MODULE_ID);
  if (emma === undefined) return { ok: false, problem: { reason: 'missing' } };
  const { version } = emma;
  const flags: unknown = typeof emma.json === 'object' && emma.json !== null ? Reflect.get(emma.json, 'flags') : null;
  const flag = kitFlag(flags);
  if (flag === undefined) return { ok: false, problem: { reason: 'module-too-old', version } };
  const fit = kitFit(flag.api);
  if (fit !== 'fits') return { ok: false, problem: { reason: fit, version } };
  // The version in the query has the browser import an updated module's kit afresh, not the one it already has.
  const path = `modules/${EMMA_MODULE_ID}/${flag.path.replace(/^\/+/, '')}?v=${encodeURIComponent(version)}`;
  return { ok: true, url: route(path), version };
}

/**
 * Import the kit, and check that it fits.
 * @param found - Where it is
 * @param load - Imports an ES module by URL; the browser's `import()` by default
 * @returns The kit
 * @throws {KitUnavailable} If it does not fit after all, as when the manifest and the kit disagree
 */
export async function loadKit(
  found: KitFound,
  load: (url: string) => Promise<unknown> = url => import(/* @vite-ignore */ url),
): Promise<SetupKit> {
  const loaded = await load(found.url);
  const kit: unknown = typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : undefined;
  const api: unknown = typeof kit === 'object' && kit !== null ? Reflect.get(kit, 'api') : undefined;
  const fit = kitFit(api);
  if (fit !== 'fits') throw new KitUnavailable({ reason: fit, version: found.version });
  return kit as SetupKit;
}
