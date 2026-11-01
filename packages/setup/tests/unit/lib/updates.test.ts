import type { CoreRelease, Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test, vi } from 'vitest';

import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import { findUpdates } from '../../../src/lib/updates';
import { installation, installedModule, record, recorded, release } from '../../mocks/fixtures';
import { KIT } from '../../mocks/kit';

const CORE = { version: '14.368', generation: 14, channel: 'stable' } as const;

/**
 * Search for updates.
 * @param modules - The installed modules, each as `[id, version]`
 * @param records - The worlds' records, by world ID; each world uses D&D 5e
 * @param releases - Every release found, the installed ones among them
 * @param systems - The installed systems, each as `[id, version]`
 * @param unrecorded - The IDs of worlds without a record, which use D&D 5e too
 * @param cores - Foundry's builds known, the installed one, 14.368, among them
 * @returns What the search found
 */
async function search(
  modules: readonly (readonly [string, string])[],
  records: Readonly<Record<string, readonly (readonly [string, string])[]>>,
  releases: readonly Release[],
  systems: readonly (readonly [string, string])[] = [['dnd5e', '5.3.3']],
  unrecorded: readonly string[] = [],
  cores: readonly CoreRelease[] = [CORE],
) {
  const overview = buildOverview(
    installation({
      worlds: [...Object.keys(records), ...unrecorded].map(id => ({ id, title: id, system: 'dnd5e' })),
      modules: modules.map(([id, version]) => installedModule(id, id, version)),
      systems: systems.map(([id, version]) => ({ id, title: id, version })),
    }),
    new Map<string, RecordState>(
      Object.entries(records).map(([world, run]) => [
        world,
        recorded(record(world, { modules: run.map(([id, version]) => ({ id, title: id, version })) })),
      ]),
    ),
  );
  return findUpdates({
    resolver: KIT.resolver,
    badges: KIT.badges,
    overview,
    universe: { core: cores, releases },
    load: () => Promise.resolve([]),
  });
}

const DND = [release('system:dnd5e', '5.3.3')];

describe('findUpdates', () => {
  test("offers each package of a world the newest version the world's setup takes, never an older one", async () => {
    const found = await search(
      [
        ['app', '1.0.0'],
        ['lib', '1.0.0'],
      ],
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
      },
      [
        ...DND,
        release('module:app', '0.9.0'),
        release('module:app', '1.0.0', { requires: { lib: {} } }),
        release('module:app', '2.0.0', { requires: { lib: { minimum: '2.0.0' } } }),
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0'),
        release('module:lib', '2.5.0'),
        // Needs a newer Foundry than is installed.
        release('module:lib', '3.0.0', { core: { minimum: '15' } }),
      ],
    );

    expect(found.unresolved).toEqual([]);
    expect([...found.updates.values()]).toEqual([
      { key: 'module:app', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] },
      { key: 'module:lib', installed: '1.0.0', newest: '2.5.0', versions: ['2.5.0', '2.0.0', '1.0.0'] },
    ]);
  });

  test('offers a package the newest version every world that uses it accepts', async () => {
    const found = await search(
      [
        ['lib', '1.0.0'],
        ['old', '1.0.0'],
      ],
      {
        a: [['lib', '1.0.0']],
        b: [
          ['lib', '1.0.0'],
          ['old', '1.0.0'],
        ],
      },
      [
        ...DND,
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0'),
        release('module:lib', '3.0.0'),
        // World b's module only works with the library before 3.
        release('module:old', '1.0.0', { requires: { lib: { maximum: '2.0.0' } } }),
      ],
    );

    expect(found.updates.get('module:lib')).toMatchObject({ newest: '2.0.0', versions: ['2.0.0', '1.0.0'] });
    expect(found.updates.has('module:old')).toBe(false);
  });

  test("updates a world's game system as far as its modules allow", async () => {
    const found = await search([['app', '1.0.0']], { a: [['app', '1.0.0']] }, [
      ...DND,
      release('system:dnd5e', '5.4.0'),
      release('system:dnd5e', '6.0.0'),
      release('module:app', '1.0.0', { systems: { dnd5e: { maximum: '5.4.0' } } }),
    ]);

    expect(found.updates.get('system:dnd5e')).toEqual({
      key: 'system:dnd5e',
      installed: '5.3.3',
      newest: '5.4.0',
      versions: ['5.4.0', '5.3.3'],
    });
  });

  test('offers nothing a world uses when no setup is found for it', async () => {
    const found = await search([['app', '1.0.0']], { a: [['app', '1.0.0']] }, [
      ...DND,
      release('module:app', '1.0.0', { requires: { gone: {} } }),
      release('module:app', '2.0.0', { requires: { gone: {} } }),
    ]);

    expect(found.unresolved).toEqual(['a']);
    expect(found.updates.size).toBe(0);
  });

  test('offers a package no recorded world uses its newest version the installed Foundry can run', async () => {
    const found = await search([['idle', '1.0.0']], {}, [
      ...DND,
      release('system:dnd5e', '5.5.0'),
      release('module:idle', '1.0.0'),
      release('module:idle', '1.1.0'),
      release('module:idle', '1.2.0-beta.1'),
      release('module:idle', '1.3.0', { unlisted: true }),
      release('module:idle', '1.4.0', { core: {} }),
      release('module:idle', '2.0.0', { core: { minimum: '15' } }),
    ]);

    expect(found.updates.get('module:idle')).toMatchObject({ newest: '1.1.0', versions: ['1.1.0', '1.0.0'] });
    expect(found.updates.get('system:dnd5e')).toMatchObject({ newest: '5.5.0' });
  });

  test('offers no version found without a manifest of its own, blocking it and saying why', async () => {
    const found = await search(
      [
        ['idle', '1.0.0'],
        ['used', '1.0.0'],
      ],
      { a: [['used', '1.0.0']] },
      [
        release('system:dnd5e', '5.3.3', { versionManifest: null }),
        release('module:idle', '1.0.0', { versionManifest: null }),
        release('module:idle', '1.1.0'),
        release('module:idle', '1.2.0', { versionManifest: null }),
        release('module:used', '1.0.0', { versionManifest: null }),
        release('module:used', '2.0.0', { versionManifest: null }),
      ],
    );

    // The installed versions need none: a world keeps working with them.
    expect(found.unresolved).toEqual([]);
    expect(found.updates.get('module:idle')).toMatchObject({ newest: '1.1.0', versions: ['1.1.0', '1.0.0'] });
    expect(found.updates.get('module:used')).toBeUndefined();
    for (const [key, newest] of [
      ['module:idle', '1.2.0'],
      ['module:used', '2.0.0'],
    ] as const) {
      expect(found.blocked.get(key)?.newest).toBe(newest);
      expect(found.blocked.get(key)?.explanation?.join(' ')).toContain(
        `was found, but no manifest URL for that version could be, so it cannot be installed`,
      );
    }
  });

  test('loads the releases the resolver needs, and keeps them for the next world', async () => {
    const listed = { ...release('module:app', '2.0.0'), detail: 'listed' as const };
    const load = vi.fn(() => Promise.resolve([release('module:app', '2.0.0')]));
    const overview = buildOverview(
      installation({
        worlds: [
          { id: 'a', title: 'A', system: 'dnd5e' },
          { id: 'b', title: 'B', system: 'dnd5e' },
        ],
        modules: [installedModule('app', 'App', '1.0.0')],
      }),
      new Map(
        ['a', 'b'].map(id => [id, recorded(record(id, { modules: [{ id: 'app', title: 'App', version: '1.0.0' }] }))]),
      ),
    );

    const found = await findUpdates({
      resolver: KIT.resolver,
      badges: KIT.badges,
      overview,
      universe: { core: [CORE], releases: [...DND, release('module:app', '1.0.0'), listed] },
      load,
    });

    expect(found.updates.get('module:app')).toMatchObject({ newest: '2.0.0' });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('the badges of the versions on offer', () => {
  /**
   * No version chosen, so each package is at its installed version.
   * @returns No version
   */
  const none = () => undefined;

  const RELEASES = [
    ...DND,
    release('module:app', '1.0.0', { requires: { lib: {} } }),
    release('module:app', '2.0.0', { requires: { lib: { minimum: '2.0.0' } } }),
    release('module:lib', '1.0.0'),
    release('module:lib', '2.0.0'),
    release('module:lone', '1.0.0'),
    release('module:lone', '2.0.0', { core: { minimum: '13', verified: '13' } }),
    release('module:lone', '3.0.0', { unlisted: true }),
  ];

  test('judge a version in the setup of a world that uses it, with the others at the versions chosen', async () => {
    const found = await search(
      [
        ['app', '1.0.0'],
        ['lib', '1.0.0'],
      ],
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
      },
      RELEASES,
    );
    const { judge } = found;

    // As installed, the library is too old for the app's 2.0.0.
    expect(judge('module:app', '2.0.0', none).badge).toMatchObject({ type: 'error' });
    expect(judge('module:app', '2.0.0', key => (key === 'module:lib' ? '2.0.0' : undefined))).toMatchObject({
      version: '2.0.0',
      badge: expect.objectContaining({
        type: 'success',
        text: '1 in system:dnd5e, module:app, module:lib',
      }) as unknown,
    });
    expect(judge('system:dnd5e', '5.3.3', none).badge).toMatchObject({ type: 'success' });
    // What the version needs, as its manifest declares it.
    expect(found.planner.needsOf('module:app', '2.0.0')).toEqual([
      'app 2.0.0 depends on Foundry VTT 14 or later',
      'app 2.0.0 depends on lib 2.0.0 or later',
    ]);
  });

  test('keep the worst of the worlds that use it, saying which', async () => {
    const { judge } = await search(
      [
        ['app', '1.0.0'],
        ['lib', '1.0.0'],
      ],
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
        // Runs the app without the library it requires.
        b: [['app', '1.0.0']],
      },
      RELEASES,
    );

    const { badge } = judge('module:app', '1.0.0', none);
    expect(badge?.type).toBe('error');
    expect(badge?.text).toMatch(/As in b, the world that uses it where it fits least\.$/);
    expect(badge?.tooltip).toMatch(/<br>As in b, /);
    // Only world a runs the library, so there is no other world to name.
    expect(judge('module:lib', '1.0.0', none).badge?.text).not.toMatch(/As in/);
  });

  test('judge a package no recorded world uses by the Foundry build alone, and say which are unlisted', async () => {
    const { judge } = await search([['lone', '1.0.0']], {}, RELEASES);

    expect(judge('module:lone', '1.0.0', none).badge).toMatchObject({ type: 'success', text: '1 in module:lone' });
    expect(judge('module:lone', '2.0.0', none).badge?.type).toBe('warning');
    const unlisted = judge('module:lone', '3.0.0', none);
    expect(unlisted).toMatchObject({ unlisted: true, badge: { type: 'success' } });
    expect(unlisted.badge?.tooltip).toMatch(/<br>Not on Foundry&#39;s package listing/);
    expect(unlisted.badge?.text).toMatch(/Not on Foundry's package listing/);
    // A version not found has nothing to judge.
    expect(judge('module:lone', '9.0.0', none)).toEqual({ version: '9.0.0', badge: null });
  });

  test('give no badge to a version that declares no core compatibility, even unlisted', async () => {
    const { judge } = await search([['lone', '1.0.0']], {}, [
      ...RELEASES,
      release('module:lone', '4.0.0', { core: {} }),
      release('module:lone', '5.0.0', { core: {}, unlisted: true }),
    ]);

    expect(judge('module:lone', '4.0.0', none)).toEqual({ version: '4.0.0', badge: null });
    expect(judge('module:lone', '5.0.0', none)).toEqual({ version: '5.0.0', unlisted: true, badge: null });
  });
});

describe('the updates EMMA cannot offer', () => {
  test('hold back the system of a world without a record, saying so', async () => {
    const found = await search([], {}, [...DND, release('system:dnd5e', '6.0.6')], undefined, ['unrecorded']);

    expect(found.updates.has('system:dnd5e')).toBe(false);
    expect(found.blocked.get('system:dnd5e')).toEqual({
      key: 'system:dnd5e',
      newest: '6.0.6',
      holds: [{ reason: 'unrecorded', world: { id: 'unrecorded', title: 'unrecorded' } }],
    });
  });

  test('name the worlds whose other packages cannot work with the newest, beside the update they can take', async () => {
    const found = await search(
      [
        ['app', '1.0.0'],
        ['lib', '1.0.0'],
      ],
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
        b: [['lib', '1.0.0']],
      },
      [
        ...DND,
        release('module:app', '1.0.0', { requires: { lib: { maximum: '2.0.0' } } }),
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0'),
        release('module:lib', '3.0.0'),
      ],
    );

    expect(found.updates.get('module:lib')).toMatchObject({ newest: '2.0.0' });
    expect(found.blocked.get('module:lib')).toMatchObject({
      key: 'module:lib',
      newest: '3.0.0',
      holds: [{ reason: 'inconsistent', world: { id: 'a', title: 'a' } }],
    });
    expect(found.blocked.has('module:app')).toBe(false);
  });

  test('hold back everything a world uses that no setup is found for', async () => {
    const found = await search([['app', '1.0.0']], { a: [['app', '1.0.0']] }, [
      ...DND,
      release('module:app', '1.0.0', { requires: { gone: {} } }),
      release('module:app', '2.0.0', { requires: { gone: {} } }),
    ]);

    expect(found.unresolved).toEqual(['a']);
    expect(found.blocked.get('module:app')?.explanation).toContain(
      'Because app 2.0.0 depends on gone and no version of gone is available, app 2.0.0 cannot be used.',
    );
    expect(found.blocked.get('module:app')).toMatchObject({
      key: 'module:app',
      newest: '2.0.0',
      holds: [{ reason: 'unresolved', world: { id: 'a', title: 'a' } }],
    });
  });

  test('leave out a version the Foundry build cannot run', async () => {
    const found = await search([['lib', '1.0.0']], {}, [
      ...DND,
      release('module:lib', '1.0.0'),
      release('module:lib', '2.0.0', { core: { minimum: '15' } }),
    ]);

    expect(found.blocked.size).toBe(0);
  });
});

describe('updates of Foundry VTT itself', () => {
  /**
   * A stable build.
   * @param version - Its version
   * @returns The build
   */
  const build = (version: string): CoreRelease => ({ version, generation: 14, channel: 'stable' });
  const CORES = [CORE, build('14.369'), build('14.370')];
  /**
   * No version chosen.
   * @returns No version
   */
  const none = () => undefined;

  test('offer the newest build every recorded world can take, blocking a newer one and naming the world', async () => {
    const found = await search(
      [
        ['app', '1.0.0'],
        ['lib', '1.0.0'],
      ],
      { a: [['app', '1.0.0']], b: [['lib', '1.0.0']] },
      [
        ...DND,
        release('module:app', '1.0.0', { core: { minimum: '14', verified: '14', maximum: '14.369' } }),
        release('module:lib', '1.0.0'),
      ],
      undefined,
      [],
      CORES,
    );

    expect(found.updates.get('core')).toEqual({
      key: 'core',
      installed: '14.368',
      newest: '14.369',
      versions: ['14.369', '14.368'],
    });
    expect(found.blocked.get('core')).toMatchObject({
      key: 'core',
      newest: '14.370',
      holds: [{ reason: 'inconsistent', world: { id: 'a', title: 'a' } }],
    });

    const { judge } = found;
    expect(judge('core', '14.369', none).badge).toMatchObject({
      type: 'success',
      text: 'Every package the recorded worlds run works with it.',
    });
    expect(judge('core', '14.370', none).badge).toMatchObject({ type: 'error', text: 'Will not work with it: app.' });
    // A package is judged with the build chosen.
    expect(judge('module:app', '1.0.0', none).badge?.type).toBe('success');
    expect(judge('module:app', '1.0.0', key => (key === 'core' ? '14.370' : undefined)).badge?.type).toBe('error');
  });

  test('hold a world without a record to the builds its installed system runs on', async () => {
    const found = await search(
      [],
      {},
      [release('system:dnd5e', '5.3.3', { core: { minimum: '14', verified: '14', maximum: '14.369' } })],
      undefined,
      ['u'],
      CORES,
    );

    expect(found.updates.get('core')).toMatchObject({ newest: '14.369' });
    expect(found.blocked.get('core')?.holds).toEqual([{ reason: 'unrecorded', world: { id: 'u', title: 'u' } }]);
    // Without a recorded world, a build has nothing to be judged by.
    expect(found.judge('core', '14.369', none)).toEqual({ version: '14.369', badge: null });
  });

  test('let a world whose system is not installed hold nothing back', async () => {
    const found = await search([], {}, [], [], ['u'], CORES);

    expect(found.updates.get('core')).toMatchObject({ newest: '14.370' });
    expect(found.blocked.has('core')).toBe(false);
  });

  test('offer no build but the stable ones, and none at all with only the installed one known', async () => {
    const testing = await search([], {}, DND, undefined, [], [CORE, { ...build('14.369'), channel: 'testing' }]);
    expect(testing.updates.has('core')).toBe(false);
    expect(testing.blocked.has('core')).toBe(false);

    const alone = await search([], {}, DND);
    expect(alone.updates.has('core')).toBe(false);
  });

  test('offer a version only a newer build runs, bringing that build in', async () => {
    const found = await search(
      [['lib', '1.0.0']],
      { a: [['lib', '1.0.0']] },
      [
        ...DND,
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0', { core: { minimum: '14.369', verified: '14' } }),
      ],
      undefined,
      [],
      CORES,
    );

    expect(found.updates.get('module:lib')).toMatchObject({ newest: '2.0.0' });
    expect(found.blocked.has('module:lib')).toBe(false);
    await expect(found.planner.complete(new Map([['module:lib', '2.0.0']]))).resolves.toEqual({
      ok: true,
      versions: new Map([
        ['core', '14.369'],
        ['module:lib', '2.0.0'],
      ]),
    });
  });

  test('block a version only a newer build runs that some world cannot take, saying which build and world', async () => {
    const found = await search(
      [
        ['lib', '1.0.0'],
        ['old', '1.0.0'],
      ],
      { a: [['lib', '1.0.0']], b: [['old', '1.0.0']] },
      [
        ...DND,
        release('module:lib', '1.0.0'),
        release('module:lib', '2.0.0', { core: { minimum: '14.369', verified: '14' } }),
        release('module:old', '1.0.0', { core: { minimum: '14', verified: '14', maximum: '14.368' } }),
      ],
      undefined,
      [],
      CORES,
    );

    expect(found.updates.has('module:lib')).toBe(false);
    expect(found.blocked.get('module:lib')).toMatchObject({
      key: 'module:lib',
      newest: '2.0.0',
      holds: [{ reason: 'inconsistent', world: { id: 'b', title: 'b' } }],
      needsCore: '14.369',
    });
  });
});
