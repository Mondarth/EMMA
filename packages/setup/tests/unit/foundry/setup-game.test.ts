import { describe, expect, test, vi } from 'vitest';

import { isSetupGame, readInstallation, setupGame } from '../../../src/foundry/setup-game';
import { installSetupMocks } from '../../mocks/foundry';

describe('isSetupGame', () => {
  const GAME = { view: 'setup', version: '14.368', post: () => undefined, worlds: [], modules: [], systems: [] };

  test("recognises the setup screen's game", () => {
    expect(isSetupGame(GAME)).toBe(true);
  });

  test.each([
    ['a world', { ...GAME, view: 'game' }],
    ['no version', { ...GAME, version: 14 }],
    ['no way to post', { ...GAME, post: undefined }],
    ['worlds that are not a collection', { ...GAME, worlds: {} }],
    ['systems that are missing', { ...GAME, systems: null }],
    ['nothing', undefined],
    ['text', 'setup'],
  ])('refuses %s', (_label, value) => {
    expect(isSetupGame(value)).toBe(false);
  });
});

describe('setupGame', () => {
  test("gives the setup screen's game", () => {
    const { game } = installSetupMocks();

    expect(setupGame()).toBe(game);
  });

  test('gives nothing elsewhere', () => {
    vi.stubGlobal('game', { view: 'game' });

    expect(setupGame()).toBeUndefined();
  });
});

describe('readInstallation', () => {
  test('reads what is installed, sorted by title, leaving out what is incomplete', () => {
    const { game } = installSetupMocks({
      core: '14.370',
      worlds: [
        { id: 'b', title: 'Beta', system: 'pf2e' },
        { id: 'a', title: 'alpha' },
        { id: 'x', system: undefined },
      ],
      modules: [
        { id: 'z', title: 'Zed', version: '2.0.0' },
        { id: 'y', title: 'Zed', version: '1.0.0' },
        { id: 'n', version: undefined },
      ],
      systems: [{ id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' }],
    });
    game.worlds.set('broken', null);
    game.modules.set('broken', null);

    expect(readInstallation(game as never)).toEqual({
      core: '14.370',
      worlds: [
        { id: 'a', title: 'alpha', system: 'dnd5e' },
        { id: 'b', title: 'Beta', system: 'pf2e' },
      ],
      modules: [
        { id: 'y', title: 'Zed', version: '1.0.0', systems: [], requires: [] },
        { id: 'z', title: 'Zed', version: '2.0.0', systems: [], requires: [] },
      ],
      systems: [{ id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' }],
    });
  });

  test("reads the game systems each module is for and the modules it requires, from Foundry's sets", () => {
    const { game } = installSetupMocks({
      modules: [
        {
          id: 'app',
          relationships: {
            systems: new Set([{ id: 'dnd5e', type: 'system' }, { id: 'pf2e' }]),
            requires: new Set([
              { id: 'lib', type: 'module' },
              { id: 'lib', type: 'module' },
              { id: 'old' },
              { id: 'dnd5e', type: 'system' },
              { id: 'app', type: 'module' },
              { type: 'module' },
              null,
            ]),
          },
        },
        { id: 'loose', relationships: { systems: 'dnd5e', requires: undefined } },
      ],
    });

    expect(readInstallation(game as never).modules).toEqual([
      { id: 'app', title: 'app', version: '1.0.0', systems: ['dnd5e', 'pf2e'], requires: ['lib', 'old'] },
      { id: 'loose', title: 'loose', version: '1.0.0', systems: [], requires: [] },
    ]);
  });
});
