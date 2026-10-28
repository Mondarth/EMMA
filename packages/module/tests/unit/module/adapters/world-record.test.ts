import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  canKeepWorldRecord,
  describeWorld,
  isActiveGM,
  readWorldRecord,
  writeWorldRecord,
} from '@module/adapters/world-record';
import { stampRecord } from '@mondarth/emma-core/world-record';
import type { FoundryMockOptions } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';

const PATH = 'worlds/test-world/mondarth-emma.json';

/**
 * Install the mocks, serving the user data folder to `fetch`.
 * @param options - Mock state
 * @returns The installed mocks
 */
function setUp(options: FoundryMockOptions = {}) {
  const mocks = installFoundryMocks(options);
  vi.stubGlobal('fetch', mocks.foundry.serveFiles);
  return mocks;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('describeWorld', () => {
  test('gives the platform, the world and the modules saved as active, sorted by ID', () => {
    setUp({
      modules: {
        'mondarth-emma': { title: 'EMMA', version: '0.9.0' },
        zeta: { title: 'A Zeta', version: '2.0.0' },
        alpha: { title: 'Z Alpha', version: '1.0.0' },
        idle: { title: 'Idle' },
      },
      settings: { 'core.moduleConfiguration': { zeta: true, alpha: true, 'mondarth-emma': true, gone: true } },
      system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
    });

    expect(describeWorld()).toEqual({
      schema: 1,
      emma: '0.9.0',
      world: { id: 'test-world', title: 'Test World' },
      core: '14.368',
      system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      modules: [
        { id: 'alpha', title: 'Z Alpha', version: '1.0.0' },
        { id: 'mondarth-emma', title: 'EMMA', version: '0.9.0' },
        { id: 'zeta', title: 'A Zeta', version: '2.0.0' },
      ],
    });
  });
});

describe('canKeepWorldRecord', () => {
  test.each([
    ['a GM allowed to use files', { isGM: true }, true],
    ['a GM not allowed to use files', { isGM: true, canUseFiles: false }, false],
    ['a player, even one allowed to use files', { isGM: false, canUseFiles: true }, false],
    ['nobody yet', { isGM: null }, false],
  ] as const)('is %s: %s', (_label, options, expected) => {
    setUp(options);

    expect(canKeepWorldRecord()).toBe(expected);
  });
});

describe('isActiveGM', () => {
  test.each([
    ['self', true],
    ['other', false],
    [null, false],
  ] as const)('with the active GM %s, is %s', (activeGM, expected) => {
    setUp({ activeGM });

    expect(isActiveGM()).toBe(expected);
  });
});

describe('readWorldRecord', () => {
  test('gives nothing for a missing record, without asking for it', async () => {
    const { foundry } = setUp();

    await expect(readWorldRecord()).resolves.toBeUndefined();

    expect(foundry.browse).toHaveBeenCalledExactlyOnceWith('data', 'worlds/test-world');
    expect(foundry.serveFiles).not.toHaveBeenCalled();
  });

  test('reads the record, never from the browser cache', async () => {
    const { foundry } = setUp();
    foundry.files.set(PATH, '{"schema":1}');

    await expect(readWorldRecord()).resolves.toEqual({ schema: 1 });

    expect(foundry.serveFiles).toHaveBeenCalledExactlyOnceWith(`/${PATH}`, { cache: 'no-store' });
  });

  test('gives nothing for a record that is not JSON', async () => {
    const { foundry } = setUp();
    foundry.files.set(PATH, 'not JSON');

    await expect(readWorldRecord()).resolves.toBeUndefined();
  });

  test('fails when the record is listed but cannot be fetched', async () => {
    const { foundry } = setUp();
    foundry.files.set(PATH, '{}');
    foundry.serveFiles.mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(readWorldRecord()).rejects.toThrow('HTTP 500');
  });
});

describe('writeWorldRecord', () => {
  const RECORD = stampRecord(
    {
      schema: 1,
      emma: '0.9.0',
      world: { id: 'test-world', title: 'Test World' },
      core: '14.368',
      system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
      modules: [],
    },
    new Date(0),
  );

  test('uploads the record into the root of the world folder, quietly', async () => {
    const { foundry } = setUp();

    await writeWorldRecord(RECORD);

    expect(foundry.upload).toHaveBeenCalledExactlyOnceWith(
      'data',
      'worlds/test-world',
      expect.any(File),
      {},
      {
        notify: false,
      },
    );
    expect(JSON.parse(foundry.files.get(PATH) ?? '')).toEqual(RECORD);
  });

  test.each([false, undefined, {}])('fails when the upload answers %j', async answer => {
    const { foundry } = setUp();
    foundry.upload.mockResolvedValueOnce(answer as never);

    await expect(writeWorldRecord(RECORD)).rejects.toThrow('did not save');
  });
});
