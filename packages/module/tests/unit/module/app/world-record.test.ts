import { afterEach, describe, expect, test, vi } from 'vitest';

import { startWorldRecord, syncWorldRecord } from '@module/app/world-record';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const PATH = 'worlds/test-world/mondarth-emma.json';

/**
 * Install the mocks with EMMA and one other module active, serving the user data folder to `fetch`.
 * @param options - Further mock state
 * @returns The installed mocks
 */
function setUp(options: FoundryMockOptions = {}) {
  const mocks = installFoundryMocks({
    modules: { 'mondarth-emma': { version: '0.9.0' }, lib: { title: 'Library' } },
    settings: { 'core.moduleConfiguration': { 'mondarth-emma': true, lib: true } },
    ...options,
  });
  vi.stubGlobal('fetch', mocks.foundry.serveFiles);
  return mocks;
}

/**
 * The record written, parsed.
 * @param files - The user data folder
 * @returns The record, or `undefined` if there is none
 */
function written(files: Map<string, string>): Record<string, unknown> | undefined {
  const text = files.get(PATH);
  return text === undefined ? undefined : (JSON.parse(text) as Record<string, unknown>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncWorldRecord', () => {
  test('writes a missing record', async () => {
    const { foundry } = setUp();

    await expect(syncWorldRecord()).resolves.toBe('written');

    expect(written(foundry.files)).toMatchObject({
      schema: 1,
      emma: '0.9.0',
      modules: [
        { id: 'lib', title: 'Library', version: '1.0.0' },
        { id: 'mondarth-emma', title: 'mondarth-emma', version: '0.9.0' },
      ],
      updated: expect.any(String) as unknown,
    });
  });

  test('leaves a record that says the same alone', async () => {
    const { foundry } = setUp();
    await syncWorldRecord();
    foundry.upload.mockClear();

    await expect(syncWorldRecord()).resolves.toBe('current');

    expect(foundry.upload).not.toHaveBeenCalled();
  });

  test('rewrites a record that says something else', async () => {
    const { foundry, game } = setUp();
    await syncWorldRecord();

    await game.settings.set('core', 'moduleConfiguration', { 'mondarth-emma': true, lib: false });

    await expect(syncWorldRecord()).resolves.toBe('written');
    expect(written(foundry.files)?.modules).toEqual([
      { id: 'mondarth-emma', title: 'mondarth-emma', version: '0.9.0' },
    ]);
  });

  test('rewrites a record that is not JSON', async () => {
    const { foundry } = setUp();
    foundry.files.set(PATH, 'not JSON');

    await expect(syncWorldRecord()).resolves.toBe('written');
    expect(written(foundry.files)).toMatchObject({ schema: 1 });
  });

  test('is skipped for a user who may not keep the record', async () => {
    const { foundry } = setUp({ isGM: false });

    await expect(syncWorldRecord()).resolves.toBe('skipped');

    expect(foundry.browse).not.toHaveBeenCalled();
  });

  test('logs a failure rather than throwing it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { foundry } = setUp();
    foundry.upload.mockResolvedValueOnce(false as never);

    await expect(syncWorldRecord()).resolves.toBe('failed');

    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to keep the world record', expect.any(Error));
  });

  test('runs checks one after another', async () => {
    const { foundry } = setUp();

    await expect(Promise.all([syncWorldRecord(), syncWorldRecord()])).resolves.toEqual(['written', 'current']);

    expect(foundry.upload).toHaveBeenCalledOnce();
  });
});

describe('startWorldRecord', () => {
  test('the active GM checks the record at once, and before leaving the world', async () => {
    const { foundry, libWrapper } = setUp();

    startWorldRecord();
    await vi.waitFor(() => {
      expect(written(foundry.files)).toBeDefined();
    });

    expect(libWrapper.register).toHaveBeenCalledTimes(2);
  });

  test('another GM checks it only before leaving the world', async () => {
    const { foundry, libWrapper } = setUp({ activeGM: 'other' });

    startWorldRecord();
    await Promise.resolve();

    expect(foundry.browse).not.toHaveBeenCalled();
    expect(libWrapper.register).toHaveBeenCalledTimes(2);
  });

  test('a player never does', () => {
    const { foundry, libWrapper } = setUp({ isGM: false });

    startWorldRecord();

    expect(foundry.browse).not.toHaveBeenCalled();
    expect(libWrapper.register).not.toHaveBeenCalled();
  });
});

describe('telling the GM what changed since the world last ran', () => {
  /**
   * Keep a record of the world as it last ran: Foundry 14.360, D&D 5e 5.0.0, Library 0.9.0, EMMA 0.9.0 and Old 1.0.0,
   * which is uninstalled since.
   * @param files - The user data folder
   * @param change - What else the record says
   */
  function ranBefore(files: Map<string, string>, change: Record<string, unknown> = {}): void {
    const record = {
      schema: 1,
      emma: '0.9.0',
      world: { id: 'test-world', title: 'Test World' },
      core: '14.360',
      system: { id: 'dnd5e', title: 'Dungeons & Dragons Fifth Edition', version: '5.0.0' },
      modules: [
        { id: 'lib', title: 'Library', version: '0.9.0' },
        { id: 'mondarth-emma', title: 'mondarth-emma', version: '0.9.0' },
        { id: 'old', title: 'Old', version: '1.0.0' },
      ],
      updated: '2026-11-01T10:00:00.000Z',
      ...change,
    };
    files.set(PATH, JSON.stringify(record));
  }

  /**
   * What a dialog or chat card said, by the keys of its lines.
   * @param content - Its HTML
   * @returns The keys, in order
   */
  const keysIn = (content: string) => [...content.matchAll(/MONDARTH-EMMA\.Changes\.(\w+)/g)].map(([, key]) => key);

  test('shows a dialog, the default, that only informs, then writes the record again', async () => {
    const { foundry } = setUp();
    ranBefore(foundry.files);

    startWorldRecord();
    await vi.waitFor(() => {
      expect(written(foundry.files)?.core).toBe('14.368');
    });

    expect(foundry.prompt).toHaveBeenCalledOnce();
    const config = foundry.prompt.mock.calls[0]?.[0] as { content: string; window: { title: string } };
    expect(config.window.title).toBe('MONDARTH-EMMA.Changes.Title');
    expect(keysIn(config.content)).toEqual(['Intro', 'Core', 'System', 'Updated', 'Uninstalled']);
    expect(config.content).toContain('"title":"Library","from":"0.9.0","to":"1.0.0"');
  });

  test('whispers a chat card to the GM alone, or both, or neither, as they chose', async () => {
    const chosen = async (how: string) => {
      const mocks = setUp({ settings: { 'core.moduleConfiguration': { 'mondarth-emma': true, lib: true } } });
      await mocks.game.settings.set('mondarth-emma', 'startupChanges', how);
      ranBefore(mocks.foundry.files);
      await syncWorldRecord({ report: true });
      return mocks;
    };

    const chat = await chosen('chat');
    expect(chat.foundry.prompt).not.toHaveBeenCalled();
    expect(chat.chat.create).toHaveBeenCalledWith(
      expect.objectContaining({ whisper: ['user-1'], speaker: { alias: 'EMMA' } }),
    );
    const card = chat.chat.create.mock.calls[0]?.[0] as { content: string };
    expect(card.content).toMatch(/^<h3>MONDARTH-EMMA\.Changes\.Title<\/h3><p>/);

    const both = await chosen('both');
    expect(both.foundry.prompt).toHaveBeenCalledOnce();
    expect(both.chat.create).toHaveBeenCalledOnce();

    const none = await chosen('none');
    expect(none.foundry.prompt).not.toHaveBeenCalled();
    expect(none.chat.create).not.toHaveBeenCalled();
    expect(written(none.foundry.files)?.core).toBe('14.368');
  });

  test('says a module was downgraded, activated, deactivated, or another game system taken up', async () => {
    const { foundry } = setUp({
      modules: { 'mondarth-emma': { version: '0.9.0' }, lib: { title: 'Library' }, idle: { title: 'Idle' } },
      settings: { 'core.moduleConfiguration': { 'mondarth-emma': true, lib: true, idle: false } },
    });
    ranBefore(foundry.files, {
      core: '14.368',
      system: { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
      modules: [
        { id: 'idle', title: 'Idle', version: '1.0.0' },
        { id: 'lib', title: 'Library', version: '2.0.0' },
      ],
    });

    await syncWorldRecord({ report: true });

    const config = foundry.prompt.mock.calls[0]?.[0] as { content: string };
    expect(keysIn(config.content)).toEqual(['Intro', 'OtherSystem', 'Downgraded', 'Added', 'Deactivated']);
  });

  test('says nothing without a record to compare, when only who wrote it differs, or after a save', async () => {
    const first = setUp();
    await syncWorldRecord({ report: true });
    expect(first.foundry.prompt).not.toHaveBeenCalled();

    const emma = setUp();
    ranBefore(emma.foundry.files, {
      emma: '0.8.0',
      core: '14.368',
      system: { id: 'dnd5e', title: 'Dungeons & Dragons Fifth Edition', version: '5.1.0' },
      modules: [
        { id: 'lib', title: 'Library', version: '1.0.0' },
        { id: 'mondarth-emma', title: 'mondarth-emma', version: '0.9.0' },
      ],
    });
    await expect(syncWorldRecord({ report: true })).resolves.toBe('written');
    expect(emma.foundry.prompt).not.toHaveBeenCalled();

    const saved = setUp();
    ranBefore(saved.foundry.files);
    await expect(syncWorldRecord()).resolves.toBe('written');
    expect(saved.foundry.prompt).not.toHaveBeenCalled();
  });

  test('logs a failure to tell, and writes the record all the same', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mocks = setUp();
    await mocks.game.settings.set('mondarth-emma', 'startupChanges', 'chat');
    mocks.chat.create.mockRejectedValueOnce(new Error('No chat'));
    ranBefore(mocks.foundry.files);

    await expect(syncWorldRecord({ report: true })).resolves.toBe('written');

    expect(console.error).toHaveBeenCalledWith(
      'mondarth-emma |',
      'Unable to report what changed since the world last ran',
      expect.any(Error),
    );
  });
});
