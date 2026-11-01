import type { Compatibility, PackageKey, Release } from '@mondarth/fvtt-resolver';

import type { WorldRecord } from '@mondarth/emma-core/world-record';

import type { RecordState } from '../../src/foundry/records';
import type { InstalledModule, Installation } from '../../src/foundry/setup-game';
import type { Completion, Planner } from '../../src/lib/plans';
import type { PackageUpdate, UpdateSearch, VersionOption } from '../../src/lib/updates';

/**
 * A world record.
 * @param world - The world's ID
 * @param change - What differs from the default: Foundry 14.368, D&D 5e 5.3.3 and no modules
 * @returns The record
 */
export function record(world: string, change: Partial<WorldRecord> = {}): WorldRecord {
  return {
    schema: 1,
    emma: '0.9.0',
    world: { id: world, title: world },
    core: '14.368',
    system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
    modules: [],
    updated: '2026-10-28T12:00:00.000Z',
    ...change,
  };
}

/**
 * A recorded state.
 * @param value - The record
 * @returns The state of a world with that record
 */
export function recorded(value: WorldRecord): RecordState {
  return { kind: 'recorded', record: value };
}

/**
 * An installation: Foundry 14.368, D&D 5e 5.3.3, and what the test adds.
 * @param change - What differs
 * @returns The installation
 */
export function installation(change: Partial<Installation> = {}): Installation {
  return {
    core: '14.368',
    worlds: [],
    modules: [],
    systems: [{ id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' }],
    ...change,
  };
}

/**
 * An installed module.
 * @param id - Its ID
 * @param title - Its title
 * @param version - Its version
 * @param related - The game systems it is for and the modules it requires, if any
 * @returns The module
 */
export function installedModule(
  id: string,
  title: string,
  version: string,
  related: Partial<Pick<InstalledModule, 'systems' | 'requires'>> = {},
): InstalledModule {
  return { id, title, version, systems: [], requires: [], ...related };
}

/** What a {@link release} declares beyond its package and version. */
export interface ReleaseShape {
  /** The core versions it works with; Foundry 14 by default. */
  readonly core?: Compatibility;
  /** The modules it requires, by ID, each with the versions it admits. */
  readonly requires?: Readonly<Record<string, Compatibility>>;
  /** The game systems it runs in, by ID, each with the versions it admits; any system if none. */
  readonly systems?: Readonly<Record<string, Compatibility>>;
  readonly unlisted?: true;
  /** The manifest URL for this version alone: one at example.org unless given, and none if `null`. */
  readonly versionManifest?: string | null;
}

/**
 * A release, loaded, as the resolver has it.
 * @param ref - Its package, as `module:<id>` or `system:<id>`
 * @param version - Its version
 * @param shape - What it declares
 * @returns The release
 */
export function release(ref: `${'module' | 'system'}:${string}`, version: string, shape: ReleaseShape = {}): Release {
  const [type, id] = ref.split(':') as ['module' | 'system', string];
  const related = (entries: Readonly<Record<string, Compatibility>> = {}, kind: 'module' | 'system') =>
    Object.entries(entries).map(([other, compatibility]) => ({ package: { type: kind, id: other }, compatibility }));
  return {
    package: { type, id },
    version,
    compatibility: shape.core ?? { minimum: '14', verified: '14' },
    relationships: {
      requires: related(shape.requires, 'module'),
      systems: related(shape.systems, 'system'),
      conflicts: [],
      recommends: [],
    },
    protected: false,
    origin: `test:${ref}@${version}`,
    detail: 'loaded',
    ...(shape.unlisted === true && { unlisted: true }),
    ...(shape.versionManifest !== null && {
      versionManifest: shape.versionManifest ?? `https://example.org/${id}/${version}/${type}.json`,
    }),
  };
}

/**
 * A search for updates that finds none.
 * @returns What it found
 */
export function noUpdates(): Promise<UpdateSearch> {
  return Promise.resolve({ updates: new Map(), blocked: new Map(), unresolved: [], judge: unjudged, planner: alone() });
}

/**
 * A planner that plans the versions chosen alone, needing nothing else, offering the versions of some updates. Each
 * package's version has a manifest URL of its own, at example.org.
 * @param updates - The updates
 * @returns The planner, its titles the packages' keys
 */
export function alone(...updates: readonly PackageUpdate[]): Planner {
  const installed = new Map(updates.map(update => [update.key, update.installed]));
  const complete = (picks: ReadonlyMap<PackageKey, string>): Promise<Completion> =>
    Promise.resolve({
      ok: true,
      versions: new Map([...picks].filter(([key, version]) => installed.get(key) !== version)),
    });
  return {
    universe: { core: [], releases: [] },
    complete,
    async plan(picks) {
      const completion = await complete(picks);
      if (!completion.ok) return undefined;
      return [...completion.versions].map(([key, version]) => ({
        key,
        installed: installed.get(key) ?? version,
        version,
        ...(key !== 'core' && { manifest: `https://example.org/${key}/${version}/module.json` }),
      }));
    },
    candidates: key =>
      updates.find(update => update.key === key)?.versions.filter(version => version !== installed.get(key)) ?? [],
    titleOf: key => key,
    needsOf: () => [],
    missingManifest: () => false,
  };
}

/**
 * Badge no version.
 * @param _key - The package
 * @param version - The version
 * @returns The version, without a badge
 */
export function unjudged(_key: PackageKey, version: string): VersionOption {
  return { version, badge: null };
}

/**
 * An install of the EMMA module that does nothing.
 * @returns Once done
 */
export function noInstall(): Promise<void> {
  return Promise.resolve();
}
