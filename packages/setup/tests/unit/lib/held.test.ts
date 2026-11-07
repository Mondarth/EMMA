import { describe, expect, test } from 'vitest';

import { ignoredItems, lockedItems } from '../../../src/lib/held';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  {
    ...installation({
      worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }],
      systems: [
        { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3', locked: true },
        { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
      ],
      modules: [
        { ...installedModule('zed', 'Zed', '1.0.0'), locked: true },
        { ...installedModule('lib', 'Library', '1.0.0'), locked: true },
        installedModule('app', 'App', '2.0.0'),
      ],
    }),
    coreLocked: true,
    ignored: ['world:a', 'module:app', 'system:pf2e', 'module:zSynthetic'],
  },
  new Map([['a', recorded(record('a', { modules: [{ id: 'zSynthetic', title: 'Synthetic', version: '1.0.0' }] }))]]),
);

describe('lockedItems', () => {
  test('gives Foundry VTT first where EMMA locks it, then the game systems and modules locked, by title', () => {
    expect(lockedItems(OVERVIEW)).toEqual([
      { key: 'core', title: 'Foundry VTT', link: { kind: 'root' } },
      { key: 'system:dnd5e', title: 'D&D 5e', link: { kind: 'system', system: 'dnd5e' } },
      { key: 'module:lib', title: 'Library', link: { kind: 'module', module: 'lib' } },
      { key: 'module:zed', title: 'Zed', link: { kind: 'module', module: 'zed' } },
    ]);
  });

  test('gives nothing where nothing is locked', () => {
    expect(lockedItems(buildOverview(installation(), new Map()))).toEqual([]);
  });
});

describe('ignoredItems', () => {
  test('gives each world, game system and module ignored, a phantom module by its record, by title', () => {
    expect(ignoredItems(OVERVIEW)).toEqual([
      { key: 'world:a', title: 'Alpha', link: { kind: 'world', world: 'a' } },
      { key: 'module:app', title: 'App', link: { kind: 'module', module: 'app' } },
      { key: 'system:pf2e', title: 'Pathfinder', link: { kind: 'system', system: 'pf2e' } },
      { key: 'module:zSynthetic', title: 'Synthetic', link: { kind: 'module', module: 'zSynthetic' } },
    ]);
  });

  test('gives nothing where nothing is ignored', () => {
    expect(ignoredItems(buildOverview(installation(), new Map()))).toEqual([]);
  });
});
