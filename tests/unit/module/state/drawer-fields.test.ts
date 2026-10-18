import { describe, expect, test } from 'vitest';

import type { ModuleEntry } from '@module/adapters/modules';
import type { DrawerField } from '@module/state/drawer-fields.svelte';
import {
  DRAWER_FIELDS,
  DrawerFields,
  DrawerFieldsDraft,
  hasDetail,
  isDrawerField,
} from '@module/state/drawer-fields.svelte';
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

describe('DrawerFieldsDraft', () => {
  test('starts from the details shown now, unchanged', () => {
    const draft = new DrawerFieldsDraft(['id', 'links']);

    expect(draft.fields).toEqual(['links', 'id']);
    expect(draft.has('id')).toBe(true);
    expect(draft.dirty).toBe(false);
  });

  test('is dirty while the details chosen differ, and clean once they match again', () => {
    const draft = new DrawerFieldsDraft(['links']);

    draft.choose('id', true);
    expect(draft.fields).toEqual(['links', 'id']);
    expect(draft.dirty).toBe(true);

    draft.choose('id', false);
    expect(draft.dirty).toBe(false);
  });

  test('is dirty when one detail is swapped for another', () => {
    const draft = new DrawerFieldsDraft(['links']);

    draft.choose('links', false);
    draft.choose('id', true);

    expect(draft.dirty).toBe(true);
  });

  test('chooses the defaults without saving them', () => {
    const draft = new DrawerFieldsDraft(['id']);

    draft.chooseDefaults();

    expect(draft.fields).toEqual(['description', 'authors', 'languages']);
    expect(draft.dirty).toBe(true);
  });

  test('is clean after choosing the defaults when they are what is shown', () => {
    const draft = new DrawerFieldsDraft(['description', 'authors', 'languages']);

    draft.chooseDefaults();

    expect(draft.dirty).toBe(false);
  });
});
