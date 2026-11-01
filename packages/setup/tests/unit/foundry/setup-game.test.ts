import { describe, expect, test, vi } from 'vitest';

import {
  checkCoreUpdate,
  checkSnapshotSpace,
  isSetupGame,
  readCoreUpdate,
  readInstallation,
  readManifests,
  setupGame,
  startCoreUpdate,
} from '../../../src/foundry/setup-game';
import type { SetupGame } from '../../../src/foundry/setup-game';
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

describe('readManifests', () => {
  test("reads each installed package's manifest and manifest URL, and the Foundry build", () => {
    const { game } = installSetupMocks({
      core: '14.370',
      release: { generation: 14, channel: 'testing' },
      modules: [
        { id: 'app', version: '2.0.0', manifest: 'https://packages.example.test/app/module.json' },
        { id: 'n', version: undefined },
      ],
      systems: [{ id: 'dnd5e', version: '5.3.3', manifest: '' }],
    });
    game.modules.set('broken', null);
    game.modules.set('flat', { id: 'flat', version: '1.0.0' });

    expect(readManifests(game as never)).toEqual({
      core: { version: '14.370', generation: 14, channel: 'testing' },
      manifests: [
        {
          type: 'system',
          id: 'dnd5e',
          version: '5.3.3',
          json: { id: 'dnd5e', title: 'dnd5e', version: '5.3.3', flags: {} },
          origin: 'systems/dnd5e/system.json',
        },
        {
          type: 'module',
          id: 'app',
          version: '2.0.0',
          json: { id: 'app', title: 'app', version: '2.0.0', flags: {} },
          origin: 'modules/app/module.json',
          manifest: 'https://packages.example.test/app/module.json',
        },
      ],
    });
  });

  test("takes a stable build of the version's generation when Foundry does not say", () => {
    const { game } = installSetupMocks({ core: '15.001', release: undefined });

    expect(readManifests(game as never).core).toEqual({ version: '15.001', generation: 15, channel: 'stable' });
  });
});

describe('checkSnapshotSpace', () => {
  test("asks the server, as Foundry's Manage Backups dialog does, waiting as long as it takes", async () => {
    const { game, post } = installSetupMocks();
    post.mockResolvedValueOnce({ required: 1_000, available: 5_000 });

    await expect(checkSnapshotSpace(game as unknown as SetupGame)).resolves.toEqual({
      required: 1_000,
      available: 5_000,
    });
    expect(post).toHaveBeenCalledWith({ action: 'checkCreateSnapshotDiskSpace' }, { timeoutMs: null });
  });

  test.each([null, 'busy', { required: '1 GB', available: 5_000 }])(
    'fails on an answer it cannot read: %j',
    async answer => {
      const { game, post } = installSetupMocks();
      post.mockResolvedValueOnce(answer);

      await expect(checkSnapshotSpace(game as unknown as SetupGame)).rejects.toThrow('did not say how much space');
    },
  );
});

describe("Foundry's updater", () => {
  /**
   * The setup screen's `game`, with what the server sent it and how it answers.
   * @param data - What the server sent
   * @param answer - How it answers a request
   * @param translates - Whether it has Foundry's translations
   * @returns The game, and its `post`
   */
  function gameWith(data: unknown, answer: unknown = {}, translates = true) {
    const post = vi.fn((_request: object, _options?: object) => Promise.resolve(answer));
    const game = {
      view: 'setup',
      version: '14.368',
      worlds: [],
      modules: [],
      systems: [],
      data,
      post,
      ...(translates && { i18n: { localize: (key: string) => `[${key}]` } }),
    } as unknown as SetupGame;
    return { game, post };
  }

  test('reads whether Foundry can update itself, and its channel', () => {
    expect(
      readCoreUpdate(gameWith({ coreUpdate: { canUpdate: true }, options: { updateChannel: 'testing' } }).game),
    ).toEqual({ canUpdate: true, channel: 'testing' });
    // Launched with --noupdate, or the server says nothing of it.
    expect(readCoreUpdate(gameWith({ coreUpdate: { canUpdate: false } }).game)).toEqual({
      canUpdate: false,
      channel: 'stable',
    });
    expect(readCoreUpdate(gameWith(undefined).game)).toEqual({ canUpdate: false, channel: 'stable' });
  });

  test("asks which build the updater would install, as the Update Software form's first step does", async () => {
    const { game, post } = gameWith({}, { generation: 14, build: 370, channel: 'stable', flags: {} });

    await expect(checkCoreUpdate(game, 'stable')).resolves.toEqual({ version: '14.370', manual: false });
    expect(post).toHaveBeenCalledWith(
      { action: 'updateCheck', updateChannel: 'stable', forceUpdate: false },
      { notify: false },
    );
    post.mockResolvedValueOnce({ generation: 15, build: 300, flags: { requires_generation_reinstall: true } });
    await expect(checkCoreUpdate(game, 'stable')).resolves.toEqual({ version: '15.300', manual: true });
  });

  test("gives Foundry's word when there is no build to update to, or fails on what it cannot read", async () => {
    const { game, post } = gameWith({}, { info: 'SETUP.UpdateNoneFound' });
    await expect(checkCoreUpdate(game, 'stable')).resolves.toEqual({ none: '[SETUP.UpdateNoneFound]' });

    const untranslated = gameWith({}, { warn: 'SETUP.Slow' }, false).game;
    await expect(checkCoreUpdate(untranslated, 'stable')).resolves.toEqual({ none: 'SETUP.Slow' });

    post.mockResolvedValueOnce(null);
    await expect(checkCoreUpdate(game, 'stable')).rejects.toThrow('did not say which build');
  });

  test("starts the update, as the form's second step does, failing with Foundry's word", async () => {
    const { game, post } = gameWith({});
    await startCoreUpdate(game, 'stable');
    expect(post).toHaveBeenCalledWith(
      { action: 'updateDownload', updateChannel: 'stable', forceUpdate: false },
      { notify: false },
    );

    post.mockResolvedValueOnce({ error: 'SETUP.UpdateRefused' });
    await expect(startCoreUpdate(game, 'stable')).rejects.toThrow('[SETUP.UpdateRefused]');
    const untranslated = gameWith({}, { error: 'Not allowed' }, false).game;
    await expect(startCoreUpdate(untranslated, 'stable')).rejects.toThrow('Not allowed');
  });
});
