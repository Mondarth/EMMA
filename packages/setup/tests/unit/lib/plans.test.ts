import type { CoreRelease, Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test } from 'vitest';

import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import { createPlanner, keepChoices, withChoice } from '../../../src/lib/plans';
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
 * @returns The planner
 */
function planner(
  modules: readonly (readonly [string, string])[],
  records: Readonly<Record<string, readonly (readonly [string, string])[]>>,
  releases: readonly Release[],
  unrecorded: readonly string[] = [],
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

    await expect(plans.complete(picks(['system:dnd5e', '6.0.6']))).resolves.toEqual({
      ok: false,
      hold: { reason: 'inconsistent', world: { id: 'a', title: 'a' } },
    });
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
    await expect(breaks.complete(picks(['module:app', '2.0.0']))).resolves.toEqual({
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

    await expect(plans.complete(picks(['system:dnd5e', '6.0.6']))).resolves.toEqual({ ok: false, hold });
    await expect(plans.complete(picks(['core', '14.369']))).resolves.toEqual({ ok: false, hold });
    // The library is in no recorded world, but needs a build world u's system does not run on.
    await expect(plans.complete(picks(['module:lib', '2.0.0']))).resolves.toEqual({ ok: false, hold });
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
    await expect(plans.complete(picks(['module:idle', '3.0.0']))).resolves.toEqual({ ok: false });
    await expect(plans.complete(picks(['module:idle', '9.0.0']))).resolves.toEqual({ ok: false });
    // Nor one the build chosen does not run.
    await expect(plans.complete(picks(['core', '14.368'], ['module:idle', '2.0.0']))).resolves.toEqual({ ok: false });
  });

  test('plans the choices first, then what each needs, saying which', async () => {
    const plans = planner([['midi', '1.0.0']], { a: [['midi', '1.0.0']] }, [...DND, ...MIDI]);

    await expect(plans.plan(picks(['system:dnd5e', '6.0.6']))).resolves.toEqual([
      { key: 'system:dnd5e', installed: '5.3.3', version: '6.0.6' },
      { key: 'core', installed: '14.368', version: '14.369', by: { package: 'system:dnd5e', version: '6.0.6' } },
      { key: 'module:midi', installed: '1.0.0', version: '2.0.0', by: { package: 'system:dnd5e', version: '6.0.6' } },
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
    ]);

    expect(plans.candidates('module:midi')).toEqual(['2.0.0']);
    expect(plans.candidates('system:dnd5e')).toEqual(['6.0.6']);
    expect(plans.candidates('core')).toEqual(['14.370', '14.369']);
    expect(plans.candidates('module:gone')).toEqual([]);
    expect(plans.titleOf('module:midi')).toBe('MIDI');
    expect(plans.titleOf('core')).toBe('Foundry VTT');
    expect(plans.titleOf('module:gone')).toBe('module:gone');
    expect(plans.universe.core).toBe(CORES);
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
