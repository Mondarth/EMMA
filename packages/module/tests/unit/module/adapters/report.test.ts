import type * as Resolver from '@mondarth/fvtt-resolver';
import type { Compatibility, CoreRelease, Release, Universe } from '@mondarth/fvtt-resolver';
import { englishMessages, packageKey } from '@mondarth/fvtt-resolver';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { VersionBadge } from '@module/adapters/modules';
import { checkReport, planReport, solveReport } from '@module/adapters/report';
import { installFoundryMocks } from '../../mocks/foundry';

// Lets a test answer for the resolver's rounds, which otherwise run as they are.
const rounds = vi.hoisted((): { answer: unknown } => ({ answer: null }));
vi.mock('@mondarth/fvtt-resolver', async importOriginal => {
  const resolver = await importOriginal<typeof Resolver>();
  return {
    ...resolver,
    resolveInRounds: (...args: Parameters<typeof resolver.resolveInRounds>) =>
      rounds.answer === null ? resolver.resolveInRounds(...args) : Promise.resolve(rounds.answer),
  };
});

const CORES: CoreRelease[] = [
  { version: '14.368', generation: 14, channel: 'stable' },
  { version: '14.369', generation: 14, channel: 'stable' },
];

interface Related {
  readonly type?: 'module' | 'system';
  readonly id: string;
  readonly compatibility?: Compatibility;
}

/** What a release declares: its core compatibility and its relationships. */
interface Declared {
  readonly compatibility?: Compatibility;
  readonly requires?: Related[];
  readonly systems?: Related[];
  readonly recommends?: Related[];
  readonly conflicts?: Related[];
}

/**
 * A release, as the resolver reads one.
 * @param type - The package type
 * @param id - The package ID
 * @param version - Its version
 * @param declared - Its core compatibility and relationships
 * @returns The release
 */
function release(type: 'module' | 'system', id: string, version: string, declared: Declared = {}): Release {
  const related = (list: Related[] = [], fallback: 'module' | 'system' = 'module') =>
    list.map(({ type: kind = fallback, id: other, compatibility = {} }) => ({
      package: { type: kind, id: other },
      compatibility,
    }));
  return {
    package: { type, id },
    version,
    compatibility: declared.compatibility ?? { minimum: '14', verified: '14' },
    relationships: {
      requires: related(declared.requires),
      systems: related(declared.systems, 'system'),
      recommends: related(declared.recommends),
      conflicts: related(declared.conflicts),
    },
    protected: false,
    origin: `${type}s/${id}`,
    versionManifest: `https://files.test/${id}/${version}/${type}.json`,
    detail: 'loaded',
  };
}

/**
 * A release without a manifest URL of its own, as one known only from a manifest URL that gives the newest.
 * @param found - The release
 * @returns It, without its `versionManifest`
 */
function withoutOwnManifest(found: Release): Release {
  const { versionManifest, ...rest } = found;
  return versionManifest === undefined ? found : rest;
}

/**
 * A module's package key.
 * @param id - The module ID
 * @returns The key
 */
function moduleKey(id: string): string {
  return packageKey({ type: 'module', id });
}

const SYSTEM = packageKey({ type: 'system', id: 'dnd5e' });

/**
 * A badge by availability, as Foundry gives them, for these tests: verified, or a warning.
 * @param checked - What checking found of a release
 * @param checked.availability - Foundry's verdict
 * @returns The badge
 */
function badgeOf({ availability }: { availability: number }): VersionBadge | null {
  return availability === 1
    ? { type: 'success', icon: 'ok', tooltip: 'ok', text: 'ok' }
    : { type: 'warning', icon: 'w', tooltip: 'w', text: 'w' };
}

describe('checkReport', () => {
  beforeEach(() => {
    installFoundryMocks();
    rounds.answer = null;
  });

  test('notes the rules each package breaks, the preferences it misses and its advisories, in words', () => {
    const universe: Universe = {
      core: CORES,
      releases: [
        release('system', 'dnd5e', '6.0.0'),
        release('module', 'midi', '1.0.0', { systems: [{ id: 'dnd5e', compatibility: { maximum: '5.9' } }] }),
        release('module', 'dae', '1.0.0', {
          compatibility: { minimum: '13', verified: '13' },
          recommends: [{ id: 'times-up' }],
          conflicts: [{ id: 'rival' }],
        }),
        release('module', 'rival', '2.0.0'),
        release('module', 'quiet', '1.0.0'),
      ],
    };

    const report = checkReport(
      universe,
      {
        core: '14.368',
        system: { package: SYSTEM, version: '6.0.0' },
        modules: ['midi', 'dae', 'rival', 'quiet', 'gone'].map(id => ({
          package: moduleKey(id),
          version: id === 'rival' ? '2.0.0' : '1.0.0',
        })),
      },
      englishMessages,
      badgeOf,
    );

    expect(report).toMatchInlineSnapshot(`
      {
        "modules": [
          {
            "badge": {
              "icon": "w",
              "text": "w",
              "tooltip": "w",
              "type": "warning",
            },
            "id": "dae",
            "notes": [
              "Dae 1.0.0 conflicts with rival.",
              "MONDARTH-EMMA.Report.Check.Missed {"release":"dae 1.0.0","package":"Foundry VTT 14.368"}",
              "MONDARTH-EMMA.Report.Check.Recommends {"release":"dae 1.0.0","package":"times-up"}",
            ],
            "title": "dae",
            "version": "1.0.0",
          },
          {
            "badge": null,
            "id": "gone",
            "notes": [
              "MONDARTH-EMMA.Report.Check.Unknown",
            ],
            "title": "gone",
            "version": "1.0.0",
          },
          {
            "badge": {
              "icon": "w",
              "text": "w",
              "tooltip": "w",
              "type": "warning",
            },
            "id": "midi",
            "notes": [
              "MONDARTH-EMMA.Report.Check.Missed {"release":"midi 1.0.0","package":"dnd5e 6.0.0"}",
            ],
            "title": "midi",
            "version": "1.0.0",
          },
          {
            "badge": {
              "icon": "ok",
              "text": "ok",
              "tooltip": "ok",
              "type": "success",
            },
            "id": "quiet",
            "notes": [],
            "title": "quiet",
            "version": "1.0.0",
          },
          {
            "badge": {
              "icon": "ok",
              "text": "ok",
              "tooltip": "ok",
              "type": "success",
            },
            "id": "rival",
            "notes": [],
            "title": "rival",
            "version": "2.0.0",
          },
        ],
        "setup": {
          "core": "14.368",
          "modules": 5,
          "system": "dnd5e 6.0.0",
        },
        "valid": false,
      }
    `);
  });
});

describe('checkReport under a policy that only warns of conflicts', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('advises of a conflict with a package in the setup, as Foundry does', () => {
    const universe: Universe = {
      core: CORES,
      releases: [
        release('system', 'dnd5e', '5.1.0'),
        release('module', 'dae', '1.0.0', { conflicts: [{ id: 'rival' }] }),
        release('module', 'rival', '2.0.0'),
      ],
    };

    const report = checkReport(
      universe,
      {
        core: '14.368',
        system: { package: SYSTEM, version: '5.1.0' },
        modules: [
          { package: moduleKey('dae'), version: '1.0.0' },
          { package: moduleKey('rival'), version: '2.0.0' },
        ],
      },
      englishMessages,
      badgeOf,
      { policy: { conflicts: 'warn' } },
    );

    expect(report.valid).toBe(true);
    expect(report.modules.map(({ title, notes }) => [title, notes])).toEqual([
      ['dae', ['MONDARTH-EMMA.Report.Check.Conflicts {"release":"dae 1.0.0","package":"rival 2.0.0"}']],
      ['rival', []],
    ]);
  });
});

describe('checkReport of a module known only from a listing', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('notes that it was checked without its dependencies', () => {
    const listed = { ...release('module', 'dice', '2.0.0'), detail: 'listed' as const };

    const report = checkReport(
      { core: CORES, releases: [release('system', 'dnd5e', '5.1.0'), listed] },
      {
        core: '14.368',
        system: { package: SYSTEM, version: '5.1.0' },
        modules: [{ package: moduleKey('dice'), version: '2.0.0' }],
      },
      englishMessages,
      badgeOf,
    );

    expect(report.modules[0]?.notes).toEqual(['MONDARTH-EMMA.Report.Check.Listed']);
  });
});

describe('planReport', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  /**
   * A module release that requires others, with a manifest URL.
   * @param id - The module ID
   * @param requires - The IDs of the modules it requires
   * @returns The release
   */
  function needing(id: string, ...requires: string[]): Release {
    return {
      ...release('module', id, '1.0.0', { requires: requires.map(required => ({ id: required })) }),
      manifest: `https://example.test/${id}/latest/module.json`,
      versionManifest: `https://example.test/${id}/1.0.0/module.json`,
    };
  }

  /**
   * Plan a setup of these releases, every one active at 1.0.0, and a module whose release is not known.
   * @param releases - The releases
   * @returns The plan's IDs and manifests
   */
  function plan(releases: Release[]) {
    return planReport(
      { core: CORES, releases: [release('system', 'dnd5e', '5.1.0'), ...releases] },
      {
        core: '14.368',
        system: { package: SYSTEM, version: '5.1.0' },
        modules: [...releases.map(({ package: { id } }) => id), 'unknown'].map(id => ({
          package: moduleKey(id),
          version: '1.0.0',
        })),
      },
      englishMessages,
      new Map(releases.map(({ package: { id } }) => [id, '1.0.0'])),
    );
  }

  test('orders modules by how deep the tree of those depending on them goes, deepest first, then by ID', () => {
    // core-lib ← lib ← addon ← plugin; core-lib ← tool; socket is required only by a module not active.
    const result = plan([
      needing('plugin', 'addon'),
      needing('tool', 'core-lib'),
      needing('addon', 'lib', 'missing'),
      needing('lib', 'core-lib'),
      needing('core-lib'),
      needing('socket'),
    ]);

    expect(result.map(({ id }) => id)).toEqual(['core-lib', 'lib', 'addon', 'plugin', 'socket', 'tool', 'unknown']);
  });

  test('gives each module its title and the manifest URL of the version chosen alone, never one for the newest', () => {
    const latestOnly = {
      ...withoutOwnManifest(release('module', 'old', '1.0.0')),
      manifest: 'https://example.test/old/latest/module.json',
    };

    const [first, old, unknown] = plan([needing('lib'), latestOnly]);

    expect(first).toEqual({
      id: 'lib',
      title: 'lib',
      changes: false,
      manifest: 'https://example.test/lib/1.0.0/module.json',
    });
    expect(old).toEqual({ id: 'old', title: 'old', changes: false, manifest: null });
    // Not installed, so installing it is a change.
    expect(unknown).toEqual({ id: 'unknown', title: 'unknown', changes: true, manifest: null });
  });

  test('finds a release written with a leading v, as the setup may write it without', () => {
    const socketlib = { ...release('module', 'socketlib', 'v1.1.4'), versionManifest: 'https://example.test/v1.1.4' };

    const [found] = planReport(
      { core: CORES, releases: [release('system', 'dnd5e', '5.1.0'), socketlib] },
      {
        core: '14.368',
        system: { package: SYSTEM, version: '5.1.0' },
        modules: [{ package: moduleKey('socketlib'), version: '1.1.4' }],
      },
      englishMessages,
      new Map([['socketlib', 'v1.1.4']]),
    );

    expect(found?.manifest).toBe('https://example.test/v1.1.4');
    // Installed as v1.1.4, the same version.
    expect(found?.changes).toBe(false);
  });

  test('marks a module whose version chosen differs from the one installed as a change', () => {
    const [changed] = planReport(
      { core: CORES, releases: [release('system', 'dnd5e', '5.1.0'), needing('lib')] },
      {
        core: '14.368',
        system: { package: SYSTEM, version: '5.1.0' },
        modules: [{ package: moduleKey('lib'), version: '1.0.0' }],
      },
      englishMessages,
      new Map([['lib', '0.9.0']]),
    );

    expect(changed?.changes).toBe(true);
  });

  test('ends a cycle of dependencies where it comes back round', () => {
    const result = plan([needing('a', 'b'), needing('b', 'a'), needing('c', 'a')]);

    expect(result.map(({ id }) => id).sort()).toEqual(['a', 'b', 'c', 'unknown']);
    expect(result.at(-1)?.id).toBe('unknown');
  });
});

describe('solveReport', () => {
  beforeEach(() => {
    installFoundryMocks();
    rounds.answer = null;
  });

  const universe: Universe = {
    core: CORES,
    releases: [
      release('system', 'dnd5e', '5.1.0'),
      release('system', 'dnd5e', '6.0.0'),
      release('module', 'lib', '1.0.0'),
      release('module', 'lib', '2.0.0'),
      release('module', 'addon', '1.0.0', { requires: [{ id: 'lib', compatibility: { maximum: '1.9' } }] }),
      release('module', 'addon', '2.0.0', { requires: [{ id: 'lib', compatibility: { minimum: '2.0.0' } }] }),
      // Needs a lib there is none of, so cannot be used.
      release('module', 'addon', '3.0.0', { requires: [{ id: 'lib', compatibility: { minimum: '3.0.0' } }] }),
      release('module', 'helper', '1.0.0'),
    ],
  };
  const setup = {
    core: '14.368',
    system: { package: SYSTEM, version: '5.1.0' },
    modules: [
      { package: moduleKey('lib'), version: '1.0.0' },
      { package: moduleKey('addon'), version: '1.0.0' },
    ],
  };
  const load = vi.fn((_needs: readonly Release[]) => Promise.resolve([]));

  /**
   * The best versions of a setup with these modules, each at 1.0.0, among these releases and dnd5e 5.1.0 and 6.0.0.
   * @param releases - The modules' releases
   * @returns The changes to their best versions, or `false` if none were found
   */
  async function best(releases: Release[]) {
    const ids = [...new Set(releases.map(({ package: { id } }) => id))];
    const solved = await solveReport(
      {
        core: CORES,
        releases: [release('system', 'dnd5e', '5.1.0'), release('system', 'dnd5e', '6.0.0'), ...releases],
      },
      { ...setup, modules: ids.map(id => ({ package: moduleKey(id), version: '1.0.0' })) },
      englishMessages,
      load,
    );
    return solved.solution.kind === 'found' && solved.solution.changes.map(({ title, to }) => [title, to]);
  }

  test('changes each active module to its newest version that works with the others', async () => {
    const solved = await solveReport(universe, setup, englishMessages, load);

    expect(solved).toEqual({
      solution: {
        kind: 'found',
        changes: [
          { package: { type: 'module', id: 'lib' }, title: 'lib', from: '1.0.0', to: '2.0.0' },
          { package: { type: 'module', id: 'addon' }, title: 'addon', from: '1.0.0', to: '2.0.0' },
        ],
      },
      unloaded: [],
    });
  });

  test('finds nothing to change when every module is at its best version, whatever version was chosen', async () => {
    const chosen = {
      ...setup,
      modules: [
        { package: moduleKey('lib'), version: '2.0.0' },
        { package: moduleKey('addon'), version: '2.0.0' },
      ],
    };

    const solved = await solveReport(universe, chosen, englishMessages, load);

    expect(solved.solution).toEqual({ kind: 'found', changes: [] });
  });

  test('takes a version that is a compatibility risk, not verified for this Foundry, as it may still work', async () => {
    expect(
      await best([
        release('module', 'risky', '1.0.0'),
        release('module', 'risky', '2.0.0', { compatibility: { minimum: '13', verified: '13' } }),
      ]),
    ).toEqual([['risky', '2.0.0']]);
  });

  test('never takes a version that needs another Foundry version or system version than those chosen', async () => {
    expect(
      await best([
        release('module', 'core-bound', '1.0.0'),
        release('module', 'core-bound', '2.0.0', { compatibility: { minimum: '14.369', verified: '14' } }),
        release('module', 'system-bound', '1.0.0'),
        release('module', 'system-bound', '2.0.0', { systems: [{ id: 'dnd5e', compatibility: { minimum: '6.0.0' } }] }),
      ]),
    ).toEqual([]);
  });

  test('never takes a version that declares no compatibility, which Foundry cannot place', async () => {
    expect(
      await best([release('module', 'unknown', '1.0.0'), release('module', 'unknown', '2.0.0', { compatibility: {} })]),
    ).toEqual([]);
  });

  test('adds a module an active module needs', async () => {
    const solved = await solveReport(
      {
        core: CORES,
        releases: [
          release('system', 'dnd5e', '5.1.0'),
          release('module', 'needy', '1.0.0', { requires: [{ id: 'helper' }] }),
          release('module', 'helper', '1.0.0'),
        ],
      },
      { ...setup, modules: [{ package: moduleKey('needy'), version: '1.0.0' }] },
      englishMessages,
      load,
    );

    expect(solved.solution).toEqual({
      kind: 'found',
      changes: [{ package: { type: 'module', id: 'helper' }, title: 'helper', from: null, to: '1.0.0' }],
    });
  });

  test('does not count a version written with a leading v as a change', async () => {
    // socketlib's manifest gives v1.1.4; Foundry's listing, and so the setup, give 1.1.4.
    const written: Universe = {
      core: CORES,
      releases: [release('system', 'dnd5e', '5.1.0'), release('module', 'socketlib', 'v1.1.4')],
    };
    const chosen = { ...setup, modules: [{ package: moduleKey('socketlib'), version: '1.1.4' }] };

    const solved = await solveReport(written, chosen, englishMessages, load);

    expect(solved.solution).toEqual({ kind: 'found', changes: [] });
  });

  test('explains in numbered sentences why no versions work with the Foundry version chosen', async () => {
    const tooNew: Universe = {
      core: CORES,
      releases: [
        release('system', 'dnd5e', '5.1.0'),
        release('module', 'future', '1.0.0', { compatibility: { minimum: '14.369', verified: '14' } }),
      ],
    };

    const solved = await solveReport(
      tooNew,
      { ...setup, modules: [{ package: moduleKey('future'), version: '1.0.0' }] },
      englishMessages,
      load,
    );

    expect(solved).toMatchInlineSnapshot(`
      {
        "solution": {
          "kind": "none",
          "lines": [
            "Because future 1.0.0 depends on Foundry VTT 14.369 or later and no version of future other than 1.0.0 is available, future needs Foundry VTT 14.369 or later.",
            "So, because the requirements need future and Foundry VTT 14.368 is pinned, the requirements cannot be met. (1)",
          ],
        },
        "unloaded": [],
      }
    `);
  });

  test('says which manifests it needs when it has no answer without them', async () => {
    // As the resolver's sources do, `load` returned one release marked as failed, and left another out.
    const failed = { ...release('module', 'lib', '2.0.0'), detail: 'listed' as const, loadFailed: true };
    rounds.answer = {
      resolution: { ok: false, needs: [{ package: moduleKey('addon'), version: '2.0.0' }], warnings: [] },
      universe: { ...universe, releases: [...universe.releases, failed] },
      rounds: 10,
      unloaded: [
        { package: moduleKey('helper'), version: '1.0.0' },
        { package: moduleKey('lib'), version: '2.0.0' },
      ],
    };

    const solved = await solveReport(universe, setup, englishMessages, load);

    expect(solved).toEqual({
      solution: { kind: 'undecided', needs: ['addon 2.0.0'] },
      unloaded: ['helper 1.0.0', 'lib 2.0.0'],
    });
  });
});
