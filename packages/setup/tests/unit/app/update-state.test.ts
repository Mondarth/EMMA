import { describe, expect, test, vi } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import { KitUnavailable } from '../../../src/foundry/setup-kit';
import { buildOverview } from '../../../src/lib/overview';
import type { PackageUpdate, UpdateSearch } from '../../../src/lib/updates';
import { alone, installation } from '../../mocks/fixtures';

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
  blocked: new Map(),
  unresolved: [],
  judge: (key, version, chosen) => ({
    version,
    badge: { type: 'success', icon: '', tooltip: '', text: `${key} ${version} with ${chosen('module:lib') ?? 'none'}` },
  }),
  planner: alone(...updates),
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

  test('gives the newer version of a package EMMA cannot offer, once found', async () => {
    const blocked = { key: 'module:app', newest: '3.0.0', holds: [] };
    const updates = new UpdateState(() =>
      Promise.resolve({ ...finding(APP), blocked: new Map([['module:app', blocked]]) }),
    );
    expect(updates.blockedOf('module:app')).toBeUndefined();
    await updates.searchFor(OVERVIEW);

    expect(updates.blockedOf('module:app')).toBe(blocked);
    expect(updates.blockedOf('module:lib')).toBeUndefined();
  });

  test('explains the version looked at in a list, or else the one chosen, of a package with an update', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    await updates.searchFor(OVERVIEW);
    expect(updates.explainedOf('module:app')).toBeUndefined();
    expect(updates.explainedOf('module:other')).toBeUndefined();

    await updates.choose('module:app', '1.5.0');
    expect(updates.explainedOf('module:app')).toMatchObject({
      option: { version: '1.5.0' },
      installed: '1.0.0',
      previewing: false,
    });
    updates.setPreview('module:app', '2.0.0');
    expect(updates.explainedOf('module:app')).toMatchObject({ option: { version: '2.0.0' }, previewing: true });
    // Another list closing leaves this one's alone.
    updates.setPreview('module:lib', null);
    expect(updates.explainedOf('module:app')?.previewing).toBe(true);
    updates.setPreview('module:app', null);
    expect(updates.explainedOf('module:app')).toMatchObject({ option: { version: '1.5.0' }, previewing: false });
  });

  test('plans each choice with what it needs, refusing one the planner cannot complete', async () => {
    const planner = alone(APP, LIB);
    const plan = vi.spyOn(planner, 'plan');
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await expect(updates.optionsFor('module:app')).resolves.toEqual([]);
    await expect(updates.choose('module:app', '2.0.0')).resolves.toBe(false);
    await updates.searchFor(OVERVIEW);

    await expect(updates.choose('module:app', '2.0.0')).resolves.toBe(true);
    expect(updates.choices).toEqual([
      {
        key: 'module:app',
        installed: '1.0.0',
        chosen: '2.0.0',
        manifest: 'https://example.org/module:app/2.0.0/module.json',
      },
    ]);
    plan.mockResolvedValueOnce(undefined);
    await expect(updates.choose('module:lib', '1.1.0')).resolves.toBe(false);
    expect(updates.choices.map(({ key }) => key)).toEqual(['module:app']);
    // Not one no search offers.
    await expect(updates.choose('module:app', '9.0.0')).resolves.toBe(false);
    await expect(updates.choose('module:other', '1.0.0')).resolves.toBe(false);
  });

  test('names the choice that needs a change in the plan, and lists versions as the plan would have them', async () => {
    const planner = alone(APP, LIB);
    vi.spyOn(planner, 'plan').mockResolvedValue([
      { key: 'module:app', installed: '1.0.0', version: '2.0.0' },
      { key: 'module:lib', installed: '1.0.0', version: '1.1.0', by: { package: 'module:app', version: '2.0.0' } },
    ]);
    vi.spyOn(planner, 'complete').mockImplementation(picks =>
      Promise.resolve(
        picks.get('module:app') === '1.5.0'
          ? { ok: false }
          : { ok: true, versions: new Map([...picks, ['module:lib', '1.1.0']]) },
      ),
    );
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '2.0.0');

    expect(updates.choices[1]).toEqual({
      key: 'module:lib',
      installed: '1.0.0',
      chosen: '1.1.0',
      by: { title: 'module:app', version: '2.0.0' },
    });
    expect(updates.chosenOf('module:lib')).toBe('1.1.0');
    const options = await updates.optionsFor('module:app');
    expect(options.map(({ version }) => version)).toEqual(['2.0.0', '1.0.0']);
    updates.setPreview('module:app', '1.0.0');
    expect(updates.explainedOf('module:app')?.option).toBe(options[1]);
  });

  test('lists a version other choices stand in the way of, naming them, and leaves out one none does', async () => {
    const planner = alone(APP, LIB);
    vi.spyOn(planner, 'complete').mockImplementation(picks =>
      Promise.resolve(
        // App 1.5.0 cannot go with Library 1.1.0; App 2.0.0 cannot be had at all.
        (picks.get('module:app') === '1.5.0' && picks.get('module:lib') === '1.1.0') ||
          picks.get('module:app') === '2.0.0'
          ? { ok: false, explanation: ['Because of the library.'] }
          : { ok: true, versions: new Map(picks) },
      ),
    );
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:lib', '1.1.0');

    const options = await updates.optionsFor('module:app');

    expect(options.map(({ version }) => version)).toEqual(['1.5.0', '1.0.0']);
    expect(options[0]?.conflict).toEqual({
      remove: [{ title: 'module:lib', version: '1.1.0' }],
      explanation: ['Because of the library.'],
    });
    expect(options[0]?.badge?.text).toBe('module:app 1.5.0 with 1.1.0');
    expect(options[1]).not.toHaveProperty('conflict');
  });

  test('plans the choices again for a new search, dropping them if it cannot, and keeps only the latest', async () => {
    const planner = alone(APP, LIB);
    const answers: ((search: UpdateSearch) => void)[] = [];
    const updates = new UpdateState(
      () =>
        new Promise<UpdateSearch>(resolve => {
          answers.push(resolve);
        }),
    );
    const first = updates.searchFor(OVERVIEW);
    answers[0]?.({ ...finding(APP, LIB), planner });
    await first;
    await updates.choose('module:app', '2.0.0');

    // A search that plans them again, overtaken by another while it does.
    let replan: (entries: undefined) => void = () => undefined;
    const slow = alone(APP, LIB);
    const slowPlan = vi.spyOn(slow, 'plan').mockReturnValue(
      new Promise(resolve => {
        replan = resolve;
      }),
    );
    const second = updates.searchFor(OVERVIEW);
    answers[1]?.({ ...finding(APP, LIB), planner: slow });
    await vi.waitFor(() => {
      expect(slowPlan).toHaveBeenCalled();
    });
    const third = updates.searchFor(OVERVIEW);
    answers[2]?.({ ...finding(APP, LIB), planner });
    await third;
    replan(undefined);
    await second;
    expect(updates.choices.map(({ chosen }) => chosen)).toEqual(['2.0.0']);

    // One that cannot plan them drops them.
    const refuses = alone(APP, LIB);
    vi.spyOn(refuses, 'plan').mockResolvedValue(undefined);
    const fourth = updates.searchFor(OVERVIEW);
    answers[3]?.({ ...finding(APP, LIB), planner: refuses });
    await fourth;
    expect(updates.choices).toEqual([]);
  });

  test('badges a version with the other packages at the versions chosen, or none before a search', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    expect(updates.optionOf('module:app', '2.0.0')).toEqual({ version: '2.0.0', badge: null });
    await updates.searchFor(OVERVIEW);

    expect(updates.optionOf('module:app', '2.0.0').badge?.text).toBe('module:app 2.0.0 with 1.0.0');
    await updates.choose('module:lib', '1.1.0');
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

    await updates.choose('module:lib', '1.1.0');
    await updates.choose('module:app', '1.5.0');
    // Neither a version not offered, nor a package without an update.
    await updates.choose('module:app', '9.0.0');
    await updates.choose('module:other', '1.0.0');

    expect(updates.choices).toEqual([
      {
        key: 'module:lib',
        installed: '1.0.0',
        chosen: '1.1.0',
        manifest: 'https://example.org/module:lib/1.1.0/module.json',
      },
      {
        key: 'module:app',
        installed: '1.0.0',
        chosen: '1.5.0',
        manifest: 'https://example.org/module:app/1.5.0/module.json',
      },
    ]);
    expect(updates.chosenOf('module:app')).toBe('1.5.0');

    await updates.choose('module:lib', '1.0.0');
    expect(updates.choices.map(({ key }) => key)).toEqual(['module:app']);

    updates.clear();
    expect(updates.choices).toEqual([]);
  });

  test('drops a choice a new search no longer offers', async () => {
    let found = finding(APP, LIB);
    const updates = new UpdateState(() => Promise.resolve(found));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '2.0.0');
    await updates.choose('module:lib', '1.1.0');

    found = finding({ ...APP, newest: '1.5.0', versions: ['1.5.0', '1.0.0'] }, LIB);
    await updates.searchFor(OVERVIEW);

    expect(updates.choices.map(({ key }) => key)).toEqual(['module:lib']);
  });

  test('says why a search cannot be made, dropping what was found and chosen, until one can again', async () => {
    let unavailable = false;
    const updates = new UpdateState(() =>
      unavailable
        ? Promise.reject(new KitUnavailable({ reason: 'module-too-old', version: '0.9.0' }))
        : Promise.resolve(finding(APP)),
    );
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '2.0.0');

    unavailable = true;
    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('unavailable');
    expect(updates.problem).toEqual({ reason: 'module-too-old', version: '0.9.0' });
    expect(updates.search).toBeNull();
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

  test('offers no snapshot or backup before it has searched', () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));

    expect(updates.safeguards).toEqual([]);
  });

  test('names a package by its title in the installation, or by its key', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));
    expect(updates.titleOf('core')).toBe('Foundry VTT');
    expect(updates.titleOf('system:dnd5e')).toBe('system:dnd5e');

    await updates.searchFor(OVERVIEW);

    expect(updates.titleOf('system:dnd5e')).toBe('D&D 5e');
    expect(updates.titleOf('module:gone')).toBe('module:gone');
  });
});
