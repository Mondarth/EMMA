import { describe, expect, test } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import { KitUnavailable } from '../../../src/foundry/setup-kit';
import { buildOverview } from '../../../src/lib/overview';
import type { PackageUpdate, UpdateSearch } from '../../../src/lib/updates';
import { installation } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(installation(), new Map());

const APP: PackageUpdate = {
  key: 'module:app',
  installed: '1.0.0',
  newest: '2.0.0',
  versions: ['2.0.0', '1.5.0', '1.0.0'],
};
const LIB: PackageUpdate = { key: 'module:lib', installed: '1.0.0', newest: '1.1.0', versions: ['1.1.0', '1.0.0'] };

/**
 * A search that finds some updates.
 * @param updates - The updates
 * @returns What it found
 */
const finding = (...updates: PackageUpdate[]): UpdateSearch => ({
  updates: new Map(updates.map(update => [update.key, update])),
  unresolved: [],
  judge: (key, version, chosen) => ({
    version,
    badge: { type: 'success', icon: '', tooltip: '', text: `${key} ${version} with ${chosen('module:lib') ?? 'none'}` },
  }),
});

describe('UpdateState', () => {
  test('searches, then keeps what it found', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));
    expect(updates.status).toBe('idle');

    const searching = updates.searchFor(OVERVIEW);
    expect(updates.status).toBe('searching');
    await searching;

    expect(updates.status).toBe('found');
    expect(updates.updateOf('module:app')).toBe(APP);
    expect(updates.updateOf('module:other')).toBeUndefined();
    expect(updates.chosenOf('module:app')).toBe('1.0.0');
  });

  test('badges a version with the other packages at the versions chosen, or none before a search', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    expect(updates.optionOf('module:app', '2.0.0')).toEqual({ version: '2.0.0', badge: null });
    await updates.searchFor(OVERVIEW);

    expect(updates.optionOf('module:app', '2.0.0').badge?.text).toBe('module:app 2.0.0 with 1.0.0');
    updates.choose('module:lib', '1.1.0');
    expect(updates.optionOf('module:app', '2.0.0').badge?.text).toBe('module:app 2.0.0 with 1.1.0');
  });

  test('keeps a failure rather than throwing it', async () => {
    const updates = new UpdateState(() => Promise.reject(new Error('offline')));

    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('failed');
  });

  test("keeps only the latest search's answer", async () => {
    const answers: ((search: UpdateSearch) => void)[] = [];
    const failures: ((error: Error) => void)[] = [];
    const updates = new UpdateState(
      () =>
        new Promise((resolve, reject) => {
          answers.push(resolve);
          failures.push(reject);
        }),
    );

    const first = updates.searchFor(OVERVIEW);
    const second = updates.searchFor(OVERVIEW);
    answers[1]?.(finding(LIB));
    await second;
    answers[0]?.(finding(APP));
    await first;
    expect(updates.updateOf('module:lib')).toBe(LIB);
    expect(updates.updateOf('module:app')).toBeUndefined();

    const third = updates.searchFor(OVERVIEW);
    const fourth = updates.searchFor(OVERVIEW);
    answers[3]?.(finding(LIB));
    await fourth;
    failures[2]?.(new Error('late'));
    await third;
    expect(updates.status).toBe('found');
  });

  test('keeps the versions chosen that differ from the installed ones', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    await updates.searchFor(OVERVIEW);

    updates.choose('module:lib', '1.1.0');
    updates.choose('module:app', '1.5.0');
    // Neither a version not offered, nor a package without an update.
    updates.choose('module:app', '9.0.0');
    updates.choose('module:other', '1.0.0');

    expect(updates.choices).toEqual([
      { key: 'module:lib', installed: '1.0.0', chosen: '1.1.0' },
      { key: 'module:app', installed: '1.0.0', chosen: '1.5.0' },
    ]);
    expect(updates.chosenOf('module:app')).toBe('1.5.0');

    updates.choose('module:lib', '1.0.0');
    expect(updates.choices.map(({ key }) => key)).toEqual(['module:app']);

    updates.clear();
    expect(updates.choices).toEqual([]);
  });

  test('drops a choice a new search no longer offers', async () => {
    let found = finding(APP, LIB);
    const updates = new UpdateState(() => Promise.resolve(found));
    await updates.searchFor(OVERVIEW);
    updates.choose('module:app', '2.0.0');
    updates.choose('module:lib', '1.1.0');

    found = finding({ ...APP, newest: '1.5.0', versions: ['1.5.0', '1.0.0'] }, LIB);
    await updates.searchFor(OVERVIEW);

    expect(updates.choices.map(({ key }) => key)).toEqual(['module:lib']);
  });

  test('turns Update mode on and off, keeping the choices', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));
    await updates.searchFor(OVERVIEW);
    updates.setOn(true);
    updates.choose('module:app', '2.0.0');

    updates.setOn(false);

    expect(updates.on).toBe(false);
    expect(updates.choices).toHaveLength(1);
  });

  test('says why a search cannot be made, dropping what was found and chosen, until one can again', async () => {
    let unavailable = false;
    const updates = new UpdateState(() =>
      unavailable
        ? Promise.reject(new KitUnavailable({ reason: 'module-too-old', version: '0.9.0' }))
        : Promise.resolve(finding(APP)),
    );
    await updates.searchFor(OVERVIEW);
    updates.setOn(true);
    updates.choose('module:app', '2.0.0');

    unavailable = true;
    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('unavailable');
    expect(updates.problem).toEqual({ reason: 'module-too-old', version: '0.9.0' });
    expect(updates.search).toBeNull();
    expect(updates.on).toBe(false);
    expect(updates.choices).toEqual([]);

    unavailable = false;
    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('found');
    expect(updates.problem).toBeNull();
  });

  test('keeps only the latest search when an earlier one cannot be made', async () => {
    let refuse: (error: unknown) => void = () => undefined;
    const first = new Promise<UpdateSearch>((_resolve, reject) => {
      refuse = reject;
    });
    const searches = [first, Promise.resolve(finding(APP))];
    const updates = new UpdateState(() => searches.shift() ?? Promise.resolve(finding()));

    const earlier = updates.searchFor(OVERVIEW);
    await updates.searchFor(OVERVIEW);
    refuse(new KitUnavailable({ reason: 'missing' }));
    await earlier;

    expect(updates.status).toBe('found');
    expect(updates.problem).toBeNull();
  });
});
