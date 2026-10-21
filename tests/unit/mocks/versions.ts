import { vi } from 'vitest';

import type { PackageRef, PlatformPart, VersionChoices, VersionJudge, VersionOption } from '@module/adapters/versions';
import { HypotheticalState } from '@module/state/hypothetical.svelte';

/**
 * A version's badge for these tests: verified unless its version is in `bad`.
 * @param version - The version
 * @param bad - The versions judged unusable
 * @returns The option
 */
function option(version: string, bad: ReadonlySet<string>): VersionOption {
  const type = bad.has(version) ? 'error' : 'success';
  return {
    version,
    badge: { type, icon: 'fa-solid fa-code-branch', tooltip: `${version} ${type}`, text: `${version} ${type}` },
  };
}

/**
 * Compare versions numerically.
 * @param a - A version
 * @param b - Another
 * @returns Negative if `a` is older
 */
function compare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * A stand-in for the versions the adapter finds. Each module's first version is the installed one; the versions in
 * `bad` are judged unusable.
 * @param versions - Each module's versions, the installed one first
 * @param options - Versions judged unusable, and packages not reached
 * @param options.bad - Versions judged unusable wherever they are chosen
 * @param options.unreached - Packages whose versions could not all be looked up
 * @param options.needs - For each module, a module it is judged unusable without in the setup
 * @param options.platforms - The core's and the system's versions, the one in use first; only it by default
 * @param options.proxied - Whether it fetches through a proxy; by default it does
 * @returns The judge, with its methods as spies
 */
export function fakeJudge(
  versions: Readonly<Record<string, readonly string[]>>,
  {
    bad = [],
    unreached = [],
    needs = {},
    platforms = {},
    proxied = true,
  }: {
    bad?: readonly string[];
    unreached?: readonly PackageRef[];
    needs?: Readonly<Record<string, string>>;
    platforms?: Partial<Record<PlatformPart, readonly string[]>>;
    proxied?: boolean;
  } = {},
) {
  const unusable = new Set(bad);
  const installed = (id: string): string | undefined => versions[id]?.[0];
  // The installed version and every newer one, newest first.
  const choosable = (id: string): readonly string[] =>
    (versions[id] ?? []).filter(version => compare(version, installed(id) ?? '') >= 0).sort((a, b) => compare(b, a));
  const platformVersions = (part: PlatformPart): readonly string[] =>
    [...(platforms[part] ?? [part === 'core' ? '14.368' : '5.1.0'])].sort((a, b) => compare(b, a));
  return {
    unreached,
    proxied,
    lookUp: vi.fn((_ids: Iterable<string>): Promise<void> => Promise.resolve()),
    versionsOf: vi.fn(choosable),
    judgeChoices: vi.fn((active: Iterable<string>, choices: VersionChoices): ReadonlyMap<string, VersionOption> => {
      const setup = new Set(active);
      const chosen = new Map<string, VersionOption>();
      for (const id of setup) {
        const version = choices.modules.get(id) ?? installed(id);
        const needed = needs[id];
        const missing = needed !== undefined && !setup.has(needed);
        // Every module is judged unusable with a system version in `bad`.
        const misfit = missing || (choices.system !== undefined && unusable.has(choices.system));
        if (version !== undefined) chosen.set(id, option(version, misfit ? new Set([version]) : unusable));
      }
      return chosen;
    }),
    judgeVersions: vi.fn((_active: Iterable<string>, _choices: VersionChoices, id: string): readonly VersionOption[] =>
      choosable(id).map(version => option(version, unusable)),
    ),
    platformVersions: vi.fn(platformVersions),
    judgePlatform: vi.fn((_active: Iterable<string>, _choices: VersionChoices, part: PlatformPart) =>
      platformVersions(part).map(version => option(version, unusable)),
    ),
  } satisfies VersionJudge;
}

/**
 * Hypothetical mode's state, with versions already looked up.
 * @param versions - Each module's versions, the installed one first
 * @param options - As for {@link fakeJudge}
 * @param active - The modules staged active; by default, every module given
 * @returns The state, loaded, and the judge behind it
 */
export async function loadedVersions(
  versions: Readonly<Record<string, readonly string[]>>,
  options?: Parameters<typeof fakeJudge>[1],
  active: readonly string[] = Object.keys(versions),
) {
  const judge = fakeJudge(versions, options);
  const state = new HypotheticalState(
    () => judge,
    () => active,
  );
  await state.load();
  return { state, judge };
}
