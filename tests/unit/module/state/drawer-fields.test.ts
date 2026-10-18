import { describe, expect, test } from 'vitest';

import type { ModuleEntry } from '@module/adapters/modules';
import type { DrawerField } from '@module/state/drawer-fields.svelte';
import { DRAWER_FIELDS, DrawerFields, hasDetail, isDrawerField } from '@module/state/drawer-fields.svelte';
import { ENTRIES } from '../../component/fixtures';
import { moduleEntry } from '../../mocks/entries';

describe('isDrawerField', () => {
  test.each(DRAWER_FIELDS)('accepts %s', field => {
    expect(isDrawerField(field)).toBe(true);
  });

  test.each(['media', '', null, 3])('rejects %j', value => {
    expect(isDrawerField(value)).toBe(false);
  });
});

describe('hasDetail', () => {
  test('finds every detail in a module that gives them all but library', () => {
    const dice = ENTRIES[0] as ModuleEntry;

    expect(DRAWER_FIELDS.filter(field => hasDetail(dice, field))).toEqual(
      DRAWER_FIELDS.filter(field => field !== 'library'),
    );
  });

  test('finds only the ID in a module that gives nothing', () => {
    expect(DRAWER_FIELDS.filter(field => hasDetail(moduleEntry({ id: 'bare' }), field))).toEqual(['id']);
  });

  test('finds that a library is one', () => {
    expect(hasDetail(moduleEntry({ id: 'lib', library: true }), 'library')).toBe(true);
  });
});

describe('DrawerFields', () => {
  test('shows the description, authors and languages by default', () => {
    expect(new DrawerFields().shown).toEqual(['description', 'authors', 'languages']);
  });

  test('gives the fields shown in drawer order', () => {
    const fields = new DrawerFields(['id', 'links', 'description']);

    expect(fields.shown).toEqual(['description', 'links', 'id']);
    expect(fields.has('links')).toBe(true);
    expect(fields.has('authors')).toBe(false);
  });

  test('replaces the fields shown', () => {
    const fields = new DrawerFields();

    fields.set(['packs'] satisfies DrawerField[]);

    expect(fields.shown).toEqual(['packs']);
  });
});
