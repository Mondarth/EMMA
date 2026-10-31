import { describe, expect, test } from 'vitest';

import { groupDetail, moduleDetail, systemDetail } from '../../../src/lib/details';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

const LIBRARY = installedModule('lib', 'Library', '1.0.0');
const APP = installedModule('app', 'App', '2.0.0', { systems: ['pf2e', 'dnd5e'], requires: ['lib', 'gone'] });

/** Two D&D 5e worlds, one of which runs the app, and a world whose system, Savage Worlds, is not installed. */
const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'a', title: 'Alpha', system: 'dnd5e' },
      { id: 'b', title: 'Beta', system: 'dnd5e' },
      { id: 's', title: 'Savage', system: 'swade' },
    ],
    modules: [APP, LIBRARY],
  }),
  new Map([['a', recorded(record('a', { modules: [{ id: 'app', title: 'App', version: '1.0.0' }] }))]]),
);

describe('systemDetail', () => {
  test('gives an installed system, the worlds that use it and how many modules are for it', () => {
    expect(systemDetail(OVERVIEW, 'dnd5e')).toEqual({
      id: 'dnd5e',
      title: 'D&D 5e',
      installed: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      status: 'same',
      worlds: [
        {
          title: 'Alpha',
          ran: { id: 'dnd5e', title: 'D&D 5e', recorded: '5.3.3', installed: '5.3.3', status: 'same' },
        },
        { title: 'Beta' },
      ],
      modules: 1,
    });
  });

  test('gives a system that is not installed', () => {
    expect(systemDetail(OVERVIEW, 'swade')).toEqual({
      id: 'swade',
      title: 'swade',
      status: 'missing',
      worlds: [{ title: 'Savage' }],
      modules: 0,
    });
  });

  test('gives a system under a world that last ran with another version', () => {
    const overview = buildOverview(
      installation({ worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }] }),
      new Map([['a', recorded(record('a', { system: { id: 'dnd5e', title: 'D&D 5e', version: '4.0.0' } }))]]),
    );

    expect(systemDetail(overview, 'dnd5e', 'a')).toMatchObject({
      world: { world: { id: 'a' } },
      ran: { recorded: '4.0.0', installed: '5.3.3' },
      status: 'other',
      worlds: [{ title: 'Alpha', ran: { status: 'other' } }],
    });
  });
});

describe('moduleDetail', () => {
  test('gives a module under a world that runs it: what it last ran with, what it needs and who runs it', () => {
    const detail = moduleDetail(OVERVIEW, 'app', 'a');

    expect(detail).toMatchObject({
      id: 'app',
      title: 'App',
      installed: APP,
      world: { world: { id: 'a' } },
      run: { recorded: '1.0.0', installed: '2.0.0' },
      status: 'other',
      systems: [
        { id: 'dnd5e', title: 'D&D 5e', installed: true },
        { id: 'pf2e', title: 'pf2e', installed: false },
      ],
      requires: [
        { id: 'gone', title: 'gone', installed: false },
        { id: 'lib', title: 'Library', installed: true },
      ],
      requiredBy: [],
      activeIn: [{ title: 'Alpha' }],
    });
  });

  test('gives an installed module elsewhere, and the modules that require it', () => {
    const detail = moduleDetail(OVERVIEW, 'lib');

    expect(detail).toEqual({
      id: 'lib',
      title: 'Library',
      installed: LIBRARY,
      status: 'same',
      systems: [],
      requires: [],
      requiredBy: ['App'],
      activeIn: [{ title: 'Alpha', needed: ['App'] }],
    });
  });

  test('gives the worlds that will need a module when next run, as what they run now requires it', () => {
    const overview = buildOverview(
      installation({
        worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }],
        modules: [
          installedModule('app', 'App', '2.0.0', { requires: ['lib'] }),
          installedModule('lib', 'Library', '2.0.0', { requires: ['base'] }),
          installedModule('base', 'Base', '1.0.0'),
          installedModule('tool', 'Tool', '3.0.0', { requires: ['lib'] }),
        ],
      }),
      new Map([
        [
          'a',
          recorded(
            record('a', {
              modules: [
                { id: 'app', title: 'App', version: '1.0.0' },
                { id: 'tool', title: 'Tool', version: '2.0.0' },
              ],
            }),
          ),
        ],
      ]),
    );

    expect(moduleDetail(overview, 'lib').activeIn).toEqual([{ title: 'Alpha', needed: ['App', 'Tool'] }]);
    expect(moduleDetail(overview, 'base').activeIn).toEqual([{ title: 'Alpha', needed: ['App', 'Tool'] }]);
    expect(moduleDetail(overview, 'tool').activeIn).toEqual([{ title: 'Alpha' }]);
  });

  test('gives a module that is not installed, under a world that does not run it', () => {
    expect(moduleDetail(OVERVIEW, 'gone', 'b')).toMatchObject({
      id: 'gone',
      title: 'gone',
      world: { world: { id: 'b' } },
      status: 'missing',
      systems: [],
      requires: [],
      requiredBy: ['App'],
    });
  });
});

describe('groupDetail', () => {
  test('gives the game systems, installed then not, with how many worlds use each', () => {
    expect(groupDetail(OVERVIEW, { kind: 'systems' })).toEqual({
      title: 'Game systems',
      items: [
        { title: 'D&D 5e', detail: '2 worlds' },
        { title: 'swade', detail: '1 worlds' },
      ],
    });
  });

  test("gives the modules' groups, with how many modules are in each", () => {
    expect(groupDetail(OVERVIEW, { kind: 'modules' })).toEqual({
      title: 'Modules',
      note: expect.stringMatching(/^2 modules installed/) as string,
      items: [
        { title: 'Universal', detail: '1 modules' },
        { title: 'D&D 5e', detail: '1 modules' },
        { title: 'pf2e', detail: '1 modules' },
      ],
    });
  });

  test('leaves out the universal group without modules for any system', () => {
    const overview = buildOverview(installation({ modules: [APP] }), new Map());

    expect(groupDetail(overview, { kind: 'modules' }).items.map(({ title }) => title)).toEqual(['D&D 5e', 'pf2e']);
  });

  test('gives the modules for any system, or for one', () => {
    expect(groupDetail(OVERVIEW, { kind: 'group' })).toEqual({
      title: 'Universal',
      note: 'Modules that name no game system, for use with any.',
      items: [{ title: 'Library', detail: '1.0.0' }],
    });
    expect(groupDetail(OVERVIEW, { kind: 'group', system: 'dnd5e' })).toEqual({
      title: 'D&D 5e',
      note: 'Modules that name D&D 5e among the game systems they are for.',
      items: [{ title: 'App', detail: '2.0.0' }],
    });
    expect(groupDetail(OVERVIEW, { kind: 'group', system: 'pf2e' }).note).toBe(
      'Modules that name pf2e among the game systems they are for. pf2e is not installed.',
    );
  });
});
