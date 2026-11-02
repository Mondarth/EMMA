import type { CoreRelease, PackageRef, Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test, vi } from 'vitest';

import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import type { PlanEntry } from '../../../src/lib/plans';
import { UNINSTALL, createPlanner, installOrder, keepChoices, toldOfWorld, withChoice } from '../../../src/lib/plans';
import { installation, installedModule, record, recorded, release } from '../../mocks/fixtures';
import { KIT } from '../../mocks/kit';

/**
 * A stable build of Foundry VTT 14.
 * @param version - Its version
 * @returns The build
 */
const build = (version: string): CoreRelease => ({ version, generation: 14, channel: 'stable' });
const CORES = [build('14.368'), build('14.369'), build('14.370')];

/**
 * A planner for D&D 5e worlds.
 * @param modules - The installed modules, each as `[id, version]`
 * @param records - The worlds' records, each the modules it runs, as `[id, version]`
 * @param releases - Every release found, the installed ones among them
 * @param unrecorded - The IDs of worlds without a record
 * @param lookUp - How the releases of packages not installed are looked up, if they can be
 * @returns The planner
 */
function planner(
  modules: readonly (readonly [string, string])[],
  records: Readonly<Record<string, readonly (readonly [string, string])[]>>,
  releases: readonly Release[],
  unrecorded: readonly string[] = [],
  lookUp?: (packages: readonly PackageRef[]) => Promise<readonly Release[]>,
) {
  const overview = buildOverview(
    installation({
      worlds: [...Object.keys(records), ...unrecorded].map(id => ({ id, title: id, system: 'dnd5e' })),
      modules: modules.map(([id, version]) => installedModule(id, id.toUpperCase(), version)),
    }),
    new Map<string, RecordState>(
      Object.entries(records).map(([world, run]) => [
        world,
        recorded(record(world, { modules: run.map(([id, version]) => ({ id, title: id, version })) })),
      ]),
    ),
  );
  return createPlanner({
    resolver: KIT.resolver,
    overview,
    universe: { core: CORES, releases },
    load: () => Promise.resolve([]),
    policy: { verified: 'ignore', systemCompatibility: 'require', missingCompatibility: 'reject' },
    coreTitle: 'Foundry VTT',
    ...(lookUp !== undefined && { lookUp }),
  });
}

/** D&D 5e 5.3.3 for any Foundry 14 build, and 6.0.6, which needs 14.367. */
const DND = [
  release('system:dnd5e', '5.3.3'),
  release('system:dnd5e', '6.0.6', { core: { minimum: '14.367', verified: '14' } }),
];
/** An automation module: 1.0.0 for D&D 5e 5, 2.0.0 for D&D 5e 6, needing Foundry 14.369. */
const MIDI = [
  release('module:midi', '1.0.0', { systems: { dnd5e: { minimum: '5.3.0', maximum: '5.9.99' } } }),
  release('module:midi', '2.0.0', {
    core: { minimum: '14.369', verified: '14' },
    systems: { dnd5e: { minimum: '6.0.6', maximum: '6.0.999' } },
  }),
];

/**
 * Some choices.
 * @param entries - Each as `[key, version]`
 * @returns The choices
 */
const picks = (...entries: [string, string][]) => new Map(entries);

describe('createPlanner', () => {
  test('completes a newer system with the modules it needs, and the oldest Foundry build they run on', async () => {
    const plans = planner([['midi', '1.0.0']], { a: [['midi', '1.0.0']] }, [...DND, ...MIDI]);

    await expect(plans.complete(picks(['system:dnd5e', '6.0.6']))).resolves.toEqual({
      ok: true,
      versions: new Map([
        ['core', '14.369'],
        ['system:dnd5e', '6.0.6'],
        ['module:midi', '2.0.0'],
      ]),
    });
  });

  test('completes a newer module with the system it needs, the other way round', async () => {
    const plans = planner([['midi', '1.0.0']], { a: [['midi', '1.0.0']] }, [...DND, ...MIDI]);

    const completion = await plans.complete(picks(['module:midi', '2.0.0']));

    expect(completion.ok && completion.versions.get('system:dnd5e')).toBe('6.0.6');
  });

  test('cannot complete a newer system that a module a world runs has no version for, naming the world', async () => {
    const plans = planner([['stuck', '1.0.0']], { a: [['stuck', '1.0.0']] }, [
      ...DND,
      release('module:stuck', '1.0.0', { systems: { dnd5e: { maximum: '5.9.99' } } }),
    ]);

    const completion = await plans.complete(picks(['system:dnd5e', '6.0.6']));
    expect(completion).toMatchObject({ ok: false, hold: { reason: 'inconsistent', world: { id: 'a', title: 'a' } } });
    // In the resolver's words, told of the world and the plan.
    expect(!completion.ok && completion.explanation).toEqual([
      'Because D&D 5e 6.0.6 is the world’s system exactly when it is installed and STUCK 1.0.0 runs only in D&D 5e ' +
        '5.9.99 or earlier, D&D 5e 6.0.6 cannot be used with STUCK 1.0.0.',
      'And because no version of STUCK other than 1.0.0 is available, D&D 5e 6.0.6 cannot be used with STUCK.',
      'So, because a runs STUCK and the plan has D&D 5e 6.0.6, a cannot keep working. (1)',
    ]);
  });

  test('takes a package two worlds share to the version one needs, if the other can take it too', async () => {
    const releases = [
      ...DND,
      release('module:lib', '1.0.0'),
      release('module:lib', '2.0.0'),
      release('module:app', '1.0.0'),
      release('module:app', '2.0.0', { requires: { lib: { minimum: '2.0.0' } } }),
    ];
    const modules = [
      ['app', '1.0.0'],
      ['lib', '1.0.0'],
      ['old', '1.0.0'],
    ] as const;
    const fits = planner(
      modules,
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
        b: [['lib', '1.0.0']],
      },
      [...releases, release('module:old', '1.0.0')],
    );

    await expect(fits.complete(picks(['module:app', '2.0.0']))).resolves.toEqual({
      ok: true,
      versions: new Map([
        ['module:app', '2.0.0'],
        ['module:lib', '2.0.0'],
      ]),
    });

    // World b runs a module that only works with the library before 2.
    const breaks = planner(
      modules,
      {
        a: [
          ['app', '1.0.0'],
          ['lib', '1.0.0'],
        ],
        b: [
          ['lib', '1.0.0'],
          ['old', '1.0.0'],
        ],
      },
      [...releases, release('module:old', '1.0.0', { requires: { lib: { maximum: '1.9.9' } } })],
    );
    await expect(breaks.complete(picks(['module:app', '2.0.0']))).resolves.toMatchObject({
      ok: false,
      hold: { reason: 'inconsistent', world: { id: 'b', title: 'b' } },
    });
  });

  test('keeps the system of a world without a record, and a build it runs on', async () => {
    const releases = [
      release('system:dnd5e', '5.3.3', { core: { minimum: '14', verified: '14', maximum: '14.368' } }),
      ...DND.slice(1),
      release('module:lib', '1.0.0'),
      release('module:lib', '2.0.0', { core: { minimum: '14.369', verified: '14' } }),
    ];
    const plans = planner([['lib', '1.0.0']], {}, releases, ['u']);
    const hold = { reason: 'unrecorded', world: { id: 'u', title: 'u' } };

    await expect(plans.complete(picks(['system:dnd5e', '6.0.6']))).resolves.toMatchObject({ ok: false, hold });
    await expect(plans.complete(picks(['core', '14.369']))).resolves.toMatchObject({ ok: false, hold });
    // The library is in no recorded world, but needs a build world u's system does not run on.
    await expect(plans.complete(picks(['module:lib', '2.0.0']))).resolves.toMatchObject({ ok: false, hold });
    await expect(plans.complete(picks())).resolves.toEqual({ ok: true, versions: new Map() });
  });

  test('moves Foundry VTT for a version chosen of a module no world runs, as far as it needs', async () => {
    const plans = planner([['idle', '1.0.0']], {}, [
      ...DND,
      release('module:idle', '1.0.0'),
      release('module:idle', '2.0.0', { core: { minimum: '14.369', verified: '14' } }),
      release('module:idle', '3.0.0', { core: { minimum: '15', verified: '15' } }),
    ]);

    await expect(plans.complete(picks(['module:idle', '2.0.0']))).resolves.toEqual({
      ok: true,
      versions: new Map([
        ['module:idle', '2.0.0'],
        ['core', '14.369'],
      ]),
    });
    // No build runs it, nor a version not found.
    await expect(plans.complete(picks(['module:idle', '3.0.0']))).resolves.toEqual({
      ok: false,
      explanation: [
        'Because IDLE 3.0.0 depends on Foundry VTT 15 or later and no version of Foundry VTT 15 or later is available, ' +
          'IDLE 3.0.0 cannot be used.',
        'So, because the plan has IDLE 3.0.0, the plan cannot keep working. (1)',
      ],
    });
    await expect(plans.complete(picks(['module:idle', '9.0.0']))).resolves.toMatchObject({ ok: false });
    // Nor one the build chosen does not run.
    await expect(plans.complete(picks(['core', '14.368'], ['module:idle', '2.0.0']))).resolves.toMatchObject({
      ok: false,
    });
  });

  test('plans the choices and what each needs, saying which, in the order to install them', async () => {
    const plans = planner([['midi', '1.0.0']], { a: [['midi', '1.0.0']] }, [...DND, ...MIDI]);

    await expect(plans.plan(picks(['system:dnd5e', '6.0.6']))).resolves.toEqual([
      { key: 'core', installed: '14.368', version: '14.369', by: { package: 'system:dnd5e', version: '6.0.6' } },
      {
        key: 'system:dnd5e',
        installed: '5.3.3',
        version: '6.0.6',
        manifest: 'https://example.org/dnd5e/6.0.6/system.json',
      },
      {
        key: 'module:midi',
        installed: '1.0.0',
        version: '2.0.0',
        by: { package: 'system:dnd5e', version: '6.0.6' },
        manifest: 'https://example.org/midi/2.0.0/module.json',
      },
    ]);
    // The same choices are not worked out again.
    await expect(plans.complete(picks(['system:dnd5e', '6.0.6']))).resolves.toMatchObject({ ok: true });
    await expect(plans.plan(picks(['system:dnd5e', '9.0.0']))).resolves.toBeUndefined();
  });

  test('gives the versions that may be chosen, and the titles', () => {
    const plans = planner([['midi', '1.0.0']], { a: [['midi', '1.0.0']] }, [
      ...DND,
      ...MIDI,
      release('module:midi', '3.0.0', { core: { minimum: '15', verified: '15' } }),
      release('module:midi', '2.5.0', { versionManifest: null }),
      release('module:midi', 'v1.0.0', { versionManifest: null }),
    ]);

    // A version found without a manifest of its own, unless it is installed.
    expect(plans.missingManifest('module:midi', '2.5.0')).toBe(true);
    expect(plans.missingManifest('module:midi', 'v1.0.0')).toBe(false);
    expect(plans.missingManifest('module:midi', '2.0.0')).toBe(false);
    expect(plans.missingManifest('module:midi', '9.9.9')).toBe(false);
    expect(plans.missingManifest('core', '14.369')).toBe(false);

    // One without a manifest is among them, to be listed, locked.
    expect(plans.candidates('module:midi')).toEqual(['2.5.0', '2.0.0']);
    expect(plans.candidates('system:dnd5e')).toEqual(['6.0.6']);
    expect(plans.candidates('core')).toEqual(['14.370', '14.369']);
    expect(plans.candidates('module:gone')).toEqual([]);
    expect(plans.titleOf('module:midi')).toBe('MIDI');
    expect(plans.titleOf('core')).toBe('Foundry VTT');
    expect(plans.titleOf('module:gone')).toBe('module:gone');
    expect(plans.needsOf('module:midi', '2.0.0')).toEqual([
      'MIDI 2.0.0 depends on Foundry VTT 14.369 or later',
      'MIDI 2.0.0 runs only in D&D 5e 6.0.6 to 6.0.999',
    ]);
    expect(plans.needsOf('module:midi', '9.9.9')).toEqual([]);
    expect(plans.needsOf('core', '14.369')).toEqual([]);
    expect(plans.universe.core).toBe(CORES);
  });
});

describe('installing anew', () => {
  /** Dice: 2.0.0 needs Foundry 15, 1.5.0 runs on 14, and 1.0.0 too. */
  const DICE = [
    release('module:dice', '1.0.0'),
    release('module:dice', '1.5.0', { requires: { lib: {} } }),
    release('module:dice', '2.0.0', { core: { minimum: '15' } }),
    release('module:lib', '1.0.0'),
  ];

  test('looks up a package not installed once, offering its versions that run, and plans it with what it needs', async () => {
    const lookUp = vi.fn(() => Promise.resolve(DICE));
    const plans = planner([], { a: [] }, DND, [], lookUp);
    expect(plans.candidates('module:dice')).toEqual([]);

    await expect(plans.add('module:dice')).resolves.toBe(true);
    await expect(plans.add('module:dice')).resolves.toBe(true);
    expect(lookUp).toHaveBeenCalledExactlyOnceWith([{ type: 'module', id: 'dice' }]);

    expect(plans.candidates('module:dice')).toEqual(['1.5.0', '1.0.0']);
    await expect(plans.plan(picks(['module:dice', '1.5.0']))).resolves.toEqual([
      {
        key: 'module:lib',
        version: '1.0.0',
        by: { package: 'module:dice', version: '1.5.0' },
        manifest: 'https://example.org/lib/1.0.0/module.json',
      },
      { key: 'module:dice', version: '1.5.0', manifest: 'https://example.org/dice/1.5.0/module.json' },
    ]);
  });

  test('keeps a release looked up once, and plans afresh what failed before', async () => {
    const lookUp = vi.fn(() => Promise.resolve([...DICE, release('module:dice', '1.0.0')]));
    const plans = planner([], { a: [] }, DND, [], lookUp);
    await expect(plans.complete(picks(['module:dice', '1.0.0']))).resolves.toMatchObject({ ok: false });

    await plans.add('module:dice');

    expect(plans.universe.releases.filter(({ package: ref }) => ref.id === 'dice')).toHaveLength(3);
    await expect(plans.complete(picks(['module:dice', '1.0.0']))).resolves.toMatchObject({ ok: true });
  });

  test('finds nothing to add without a lookup, or where it finds nothing, and has the installed', async () => {
    await expect(planner([], { a: [] }, DND).add('module:dice')).resolves.toBe(false);
    await expect(planner([], { a: [] }, DND, [], () => Promise.resolve([])).add('module:dice')).resolves.toBe(false);
    await expect(planner([], { a: [] }, DND, [], () => Promise.resolve(DICE)).add('system:none')).resolves.toBe(false);
    await expect(planner([], { a: [] }, DND).add('system:dnd5e')).resolves.toBe(true);
  });
});

describe('uninstalling', () => {
  /** A library, and an app whose 1.0.0 needs nothing and whose 2.0.0 requires the library. */
  const APPS = [
    ...DND,
    release('module:lib', '1.0.0'),
    release('module:app', '1.0.0'),
    release('module:app', '2.0.0', { requires: { lib: {} } }),
    release('module:extra', '1.0.0', { requires: { lib: {} } }),
  ];

  test('uninstalls a package nothing needs, last, with nothing to install it from', async () => {
    const plans = planner(
      [
        ['lib', '1.0.0'],
        ['app', '1.0.0'],
      ],
      { a: [['app', '1.0.0']] },
      APPS,
    );

    await expect(plans.complete(picks(['module:lib', UNINSTALL]))).resolves.toEqual({
      ok: true,
      versions: new Map([['module:lib', UNINSTALL]]),
    });
    await expect(plans.plan(picks(['module:lib', UNINSTALL], ['system:dnd5e', '6.0.6']))).resolves.toEqual([
      expect.objectContaining({ key: 'system:dnd5e', version: '6.0.6' }),
      { key: 'module:lib', installed: '1.0.0', version: UNINSTALL },
    ]);
  });

  test("cannot uninstall a package a world's setup would need, saying so", async () => {
    const plans = planner(
      [
        ['lib', '1.0.0'],
        ['app', '1.0.0'],
      ],
      { a: [['app', '1.0.0']] },
      APPS,
    );

    await expect(plans.complete(picks(['module:app', '2.0.0'], ['module:lib', UNINSTALL]))).resolves.toEqual({
      ok: false,
      hold: { reason: 'inconsistent', world: { id: 'a', title: 'a' } },
      explanation: ['a needs LIB, which the plan uninstalls'],
    });
  });

  test('cannot uninstall a package a version chosen that no world uses would need', async () => {
    const plans = planner([['lib', '1.0.0']], { a: [] }, APPS);

    await expect(plans.complete(picks(['module:extra', '1.0.0'], ['module:lib', UNINSTALL]))).resolves.toEqual({
      ok: false,
      explanation: ['the plan needs LIB, which the plan uninstalls'],
    });
  });

  test('cannot uninstall the game system of a world without a record', async () => {
    const plans = planner([], {}, DND, ['b']);

    await expect(plans.complete(picks(['system:dnd5e', UNINSTALL]))).resolves.toEqual({
      ok: false,
      hold: { reason: 'unrecorded', world: { id: 'b', title: 'b' } },
    });
  });
});

describe('the order to install a plan in', () => {
  /**
   * A change in a plan.
   * @param key - The package's key
   * @returns The change
   */
  const entry = (key: string): PlanEntry => ({ key, installed: '1.0.0', version: '2.0.0' });

  test('is Foundry VTT, the game systems, then each module after those in the plan it requires', () => {
    const requires: Readonly<Record<string, readonly string[]>> = {
      'module:covens': ['module:midi', 'module:dae', 'system:dnd5e'],
      'module:midi': ['module:libwrapper', 'module:socketlib', 'module:gone'],
      'module:dae': ['module:libwrapper', 'module:covens'],
    };
    const order = installOrder(
      [
        'module:covens',
        'module:midi',
        'system:dnd5e',
        'module:dae',
        'module:socketlib',
        'module:libwrapper',
        'core',
      ].map(entry),
      ({ key }) => requires[key] ?? [],
    );

    // DAE and Coven's require each other: the one first in the plan comes after the other.
    expect(order.map(({ key }) => key)).toEqual([
      'core',
      'system:dnd5e',
      'module:libwrapper',
      'module:socketlib',
      'module:midi',
      'module:dae',
      'module:covens',
    ]);
  });

  test('uninstalls last', () => {
    const order = installOrder(
      [{ key: 'module:old', installed: '1.0.0', version: UNINSTALL }, entry('module:midi'), entry('core')],
      () => [],
    );

    expect(order.map(({ key }) => key)).toEqual(['core', 'module:midi', 'module:old']);
  });
});

describe('the choices', () => {
  test('change one, a new one last, or take it back', () => {
    const chosen = picks(['a', '1'], ['b', '2']);

    expect([...withChoice(chosen, 'a', '3')]).toEqual([
      ['a', '3'],
      ['b', '2'],
    ]);
    expect([...withChoice(chosen, 'c', '4')].map(([key]) => key)).toEqual(['a', 'b', 'c']);
    expect([...withChoice(chosen, 'a', null)]).toEqual([['b', '2']]);
    expect([...keepChoices(chosen, key => key === 'b')]).toEqual([['b', '2']]);
  });
});

describe('toldOfWorld', () => {
  test('tells the resolver’s explanations of a world, and of the plan', () => {
    const told = toldOfWorld(KIT.resolver.englishMessages, 'Alpha');

    expect(told.requirement('Midi')).toBe('Alpha runs Midi');
    expect(told.requirementsNeed('Midi 2 or later')).toBe('Alpha needs Midi 2 or later');
    expect(told.pin('D&D 5e 6.0.6')).toBe('the plan has D&D 5e 6.0.6');
    expect(told.failed).toBe('Alpha cannot keep working');
    expect(told.none).toBe(KIT.resolver.englishMessages.none);
  });
});

describe('a version chosen of a package no recorded world runs', () => {
  test('never overrides a version chosen to meet what it needs, but explains why they cannot go together', async () => {
    const plans = planner(
      [
        ['lib', '1.0.0'],
        ['kit', '1.0.0'],
      ],
      { a: [['lib', '1.0.0']] },
      [
        ...DND,
        release('module:lib', '1.0.0'),
        release('module:lib', '1.5.0'),
        release('module:lib', '2.0.0'),
        release('module:kit', '1.0.0'),
        release('module:kit', '2.0.0', { requires: { lib: { minimum: '2.0.0' } } }),
      ],
    );

    await expect(plans.complete(picks(['module:kit', '2.0.0']))).resolves.toMatchObject({
      ok: true,
      versions: new Map([
        ['module:lib', '2.0.0'],
        ['module:kit', '2.0.0'],
      ]),
    });
    const both = await plans.complete(picks(['module:kit', '2.0.0'], ['module:lib', '1.5.0']));
    expect(both).toMatchObject({ ok: false });
    expect(!both.ok && both.explanation).toEqual([
      'Because KIT 2.0.0 depends on LIB 2.0.0 or later and the plan has KIT 2.0.0, LIB 2.0.0 or later is needed.',
      'So, because the plan has LIB 1.5.0, the plan cannot keep working. (1)',
    ]);
  });

  test('keeps the build found when no older one between it and the installed one works', async () => {
    const plans = planner([['late', '1.0.0']], {}, [
      ...DND,
      release('module:late', '1.0.0'),
      release('module:late', '2.0.0', { core: { minimum: '14.370', verified: '14' } }),
    ]);

    const completion = await plans.complete(picks(['module:late', '2.0.0']));

    expect(completion.ok && completion.versions.get('core')).toBe('14.370');
  });

  test('takes Foundry VTT as chosen in an installation without worlds', async () => {
    const plans = planner([], {}, DND);

    await expect(plans.complete(picks(['core', '14.369']))).resolves.toEqual({
      ok: true,
      versions: new Map([['core', '14.369']]),
    });
    await expect(plans.complete(picks())).resolves.toEqual({ ok: true, versions: new Map() });
  });

  test('brings in what it requires, and the system it runs in, with what the worlds that use those need', async () => {
    const plans = planner(
      [
        ['midi', '1.0.0'],
        ['cat', '0.1.3'],
      ],
      { a: [['midi', '1.0.0']] },
      [
        ...DND,
        ...MIDI,
        release('module:cat', '0.1.3', { systems: { dnd5e: { minimum: '6.0.0' } } }),
        release('module:cat', '0.1.6', {
          systems: { dnd5e: { minimum: '6.0.0' } },
          requires: { midi: { minimum: '2.0.0' } },
        }),
      ],
    );

    await expect(plans.complete(picks(['module:cat', '0.1.6']))).resolves.toEqual({
      ok: true,
      versions: new Map([
        ['core', '14.369'],
        ['system:dnd5e', '6.0.6'],
        ['module:midi', '2.0.0'],
        ['module:cat', '0.1.6'],
      ]),
    });
    // The module chosen is installed after the one it requires.
    const plan = await plans.plan(picks(['module:cat', '0.1.6']));
    expect(plan?.map(({ key }) => key)).toEqual(['core', 'system:dnd5e', 'module:midi', 'module:cat']);
  });
});
