import { describe, expect, test } from 'vitest';

import { readRecord, readRecords } from '../../../src/foundry/records';
import { record } from '../../mocks/fixtures';
import { installSetupMocks } from '../../mocks/foundry';

describe('readRecord', () => {
  test("reads a world's record, never from the browser cache", async () => {
    const { fetch: fetchFile } = installSetupMocks({ records: { w: record('w') } });

    await expect(readRecord('w')).resolves.toEqual({ kind: 'recorded', record: record('w') });
    expect(fetchFile).toHaveBeenCalledExactlyOnceWith('/worlds/w/mondarth-emma.json', { cache: 'no-store' });
  });

  test('finds no record without asking for it', async () => {
    const { browse, fetch: fetchFile } = installSetupMocks();

    await expect(readRecord('w')).resolves.toEqual({ kind: 'none' });
    expect(browse).toHaveBeenCalledExactlyOnceWith('data', 'worlds/w');
    expect(fetchFile).not.toHaveBeenCalled();
  });

  test.each([
    ['not JSON', 'not JSON'],
    ['not a record', '{"schema":1}'],
  ])('finds a record that is %s unreadable', async (_label, text) => {
    installSetupMocks({ records: { w: text } });

    await expect(readRecord('w')).resolves.toEqual({ kind: 'unreadable' });
  });

  test('finds a record the server will not give unreadable', async () => {
    const { fetch: fetchFile } = installSetupMocks({ records: { w: record('w') } });
    fetchFile.mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(readRecord('w')).resolves.toEqual({ kind: 'unreadable' });
  });

  test('finds a folder that cannot be listed unreadable', async () => {
    const { browse } = installSetupMocks();
    browse.mockRejectedValueOnce(new Error('denied'));

    await expect(readRecord('w')).resolves.toEqual({ kind: 'unreadable' });
  });
});

describe('readRecords', () => {
  test('reads each world', async () => {
    installSetupMocks({ records: { a: record('a') } });

    await expect(readRecords(['a', 'b'])).resolves.toEqual(
      new Map([
        ['a', { kind: 'recorded', record: record('a') }],
        ['b', { kind: 'none' }],
      ]),
    );
  });
});
