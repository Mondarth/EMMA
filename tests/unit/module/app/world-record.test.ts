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
