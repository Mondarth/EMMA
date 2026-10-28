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
        { id: 'y', title: 'Zed', version: '1.0.0' },
        { id: 'z', title: 'Zed', version: '2.0.0' },
      ],
      systems: [{ id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' }],
    });
  });
});
