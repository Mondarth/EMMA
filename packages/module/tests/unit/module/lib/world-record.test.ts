import { describe, expect, test } from 'vitest';

import type { WorldRecordContent } from '@module/lib/world-record';
import { recordHolds, stampRecord, WORLD_RECORD_SCHEMA } from '@module/lib/world-record';

const CONTENT: WorldRecordContent = {
  schema: WORLD_RECORD_SCHEMA,
  emma: '0.9.0',
  world: { id: 'my-world', title: 'My World' },
  core: '14.368',
  system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
  modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }],
};

describe('stampRecord', () => {
  test('dates the content', () => {
    expect(stampRecord(CONTENT, new Date('2026-10-28T12:00:00Z'))).toEqual({
      ...CONTENT,
      updated: '2026-10-28T12:00:00.000Z',
    });
  });
});

describe('recordHolds', () => {
  test('holds a record that says the same, whenever it was written', () => {
    expect(recordHolds(stampRecord(CONTENT, new Date(0)), CONTENT)).toBe(true);
  });

  test('ignores the order of the keys', () => {
    const reordered = JSON.parse(
      '{"modules":[{"version":"1.0.0","title":"Library","id":"lib"}],"system":{"version":"5.3.3","title":"D&D 5e",' +
        '"id":"dnd5e"},"core":"14.368","world":{"title":"My World","id":"my-world"},"emma":"0.9.0","schema":1}',
    ) as unknown;

    expect(recordHolds(reordered, CONTENT)).toBe(true);
  });

  test.each([
    ['another module version', { modules: [{ id: 'lib', title: 'Library', version: '1.0.1' }] }],
    ['another module', { modules: [] }],
    ['another core version', { core: '14.369' }],
    ['another system version', { system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.4' } }],
    ['another EMMA version', { emma: '0.9.1' }],
    ['something more', { extra: true }],
  ])('does not hold a record with %s', (_label, change) => {
    expect(recordHolds({ ...CONTENT, ...change }, CONTENT)).toBe(false);
  });

  test.each([undefined, null, 'text', 42, [CONTENT]])('does not hold %j, which is no record', saved => {
    expect(recordHolds(saved, CONTENT)).toBe(false);
  });
});
