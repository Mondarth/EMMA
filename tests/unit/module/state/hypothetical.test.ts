import { flushSync } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { describe, expect, test, vi } from 'vitest';

import { HypotheticalState } from '@module/state/hypothetical.svelte';
import { installFoundryMocks } from '../../mocks/foundry';
import { fakeJudge, loadedVersions } from '../../mocks/versions';

describe('HypotheticalState', () => {
  test('sets nothing up and looks nothing up until asked', () => {
    const create = vi.fn(() => fakeJudge({}));

    const state = new HypotheticalState(create, () => ['dice']);

    expect(state.status).toBe('idle');
    expect(create).not.toHaveBeenCalled();
    expect(state.hasVersions('dice')).toBe(false);
    expect(state.chosen('dice')).toBeUndefined();
    expect(state.versionsOf('dice')).toEqual([]);
    expect(state.unreached).toEqual([]);
  });

  test('looks up the modules staged active, loading until done', async () => {
    let finish: () => void = () => undefined;
    const judge = fakeJudge({ dice: ['1.0.0', '2.0.0'] });
    judge.lookUp.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const state = new HypotheticalState(
      () => judge,
      () => ['dice'],
    );

    const loading = state.load();
    await Promise.resolve();

    expect(state.status).toBe('loading');
    expect(judge.lookUp).toHaveBeenCalledExactlyOnceWith(['dice']);
    finish();
    await loading;
    expect(state.status).toBe('ready');
    expect(state.hasVersions('dice')).toBe(true);
  });

  test('looks each module up once, and only those newly staged active', async () => {
    const active = new SvelteSet(['dice']);
    const judge = fakeJudge({ dice: ['1.0.0'], lib: ['1.0.0'] });
    const create = vi.fn(() => judge);
    const state = new HypotheticalState(create, () => active);

    await Promise.all([state.load(), state.load()]);
    active.add('lib');
    await state.load();
    await state.load();

    expect(create).toHaveBeenCalledOnce();
    expect(judge.lookUp.mock.calls).toEqual([[['dice']], [['lib']]]);
    expect(state.status).toBe('ready');
  });

  test('logs a failure, and looks the modules up again when next asked', async () => {
    installFoundryMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('offline');
    const judge = fakeJudge({ dice: ['1.0.0'] });
    judge.lookUp.mockRejectedValueOnce(failure);
    const state = new HypotheticalState(
      () => judge,
      () => ['dice'],
    );

    await state.load();

    expect(state.status).toBe('failed');
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to look up module versions', failure);

    await state.load();

    expect(state.status).toBe('ready');
    expect(judge.lookUp.mock.calls).toEqual([[['dice']], [['dice']]]);
  });

  test('stays loading until the last of several lookups is done', async () => {
    const active = new SvelteSet(['dice']);
    let finish: () => void = () => undefined;
    const judge = fakeJudge({ dice: ['1.0.0'], lib: ['1.0.0'] });
    judge.lookUp.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const state = new HypotheticalState(
      () => judge,
      () => active,
    );

    const first = state.load();
    active.add('lib');
    const second = state.load();
    await vi.waitFor(() => {
      expect(judge.lookUp).toHaveBeenCalledOnce();
    });
    finish();
    await first;

    expect(state.status).toBe('loading');
    await second;
    expect(state.status).toBe('ready');
  });

  test('offers a choice only for a module with a newer version than the one installed', async () => {
    const { state } = await loadedVersions({ dice: ['1.0.0', '2.0.0'], old: ['2.0.0', '1.0.0'], solo: ['1.0.0'] });

    expect(state.hasVersions('dice')).toBe(true);
    expect(state.hasVersions('old')).toBe(false);
    expect(state.hasVersions('solo')).toBe(false);
    expect(state.hasVersions('missing')).toBe(false);
  });

  test('starts each module staged active at its installed version', async () => {
    const { state } = await loadedVersions({ dice: ['1.0.0', '2.0.0'], idle: ['1.0.0', '2.0.0'] }, {}, ['dice']);

    expect(state.chosen('dice')?.version).toBe('1.0.0');
    expect(state.chosen('idle')).toBeUndefined();
  });

  test('re-judges the setup when a version is chosen', async () => {
    const { state, judge } = await loadedVersions({ dice: ['1.0.0', '2.0.0'] }, { bad: ['2.0.0'] });

    state.choose('dice', '2.0.0');
    flushSync();

    expect(state.chosen('dice')?.version).toBe('2.0.0');
    expect(state.chosen('dice')?.badge?.type).toBe('error');
    // The choices are kept in a reactive map, so are compared by their entries.
    expect([...(judge.judgeChoices.mock.lastCall?.[1].modules ?? [])]).toEqual([['dice', '2.0.0']]);
  });

  test('re-judges the setup when the modules staged active change', async () => {
    const active = new SvelteSet(['dice']);
    const judge = fakeJudge({ dice: ['1.0.0', '2.0.0'], lib: ['1.0.0'] });
    const state = new HypotheticalState(
      () => judge,
      () => active,
    );
    await state.load();
    expect(state.chosen('lib')).toBeUndefined();

    active.add('lib');
    await state.load();

    expect(state.chosen('lib')?.version).toBe('1.0.0');
    expect([...(judge.judgeChoices.mock.lastCall?.[0] ?? [])]).toEqual(['dice', 'lib']);
  });

  test('judges a module’s versions in the setup staged, with the choices made', async () => {
    const { state, judge } = await loadedVersions({ dice: ['1.0.0', '2.0.0'], lib: ['1.0.0', '3.0.0'] });
    state.choose('lib', '3.0.0');

    expect(state.versionsOf('dice').map(({ version }) => version)).toEqual(['2.0.0', '1.0.0']);
    const [active, choices, id] = judge.judgeVersions.mock.lastCall ?? [];
    expect([...(active ?? [])]).toEqual(['dice', 'lib']);
    expect([...(choices?.modules ?? [])]).toEqual([['lib', '3.0.0']]);
    expect(id).toBe('dice');
  });

  test('offers the core and the system once a newer version of either is found', async () => {
    const { state } = await loadedVersions({}, { platforms: { system: ['5.1.0', '5.2.0'] } });

    expect(state.hasPlatformVersions('core')).toBe(false);
    expect(state.hasPlatformVersions('system')).toBe(true);
    expect(state.platformVersionsOf('system').map(({ version }) => version)).toEqual(['5.2.0', '5.1.0']);
  });

  test('offers nothing of the core or the system before a lookup', () => {
    const state = new HypotheticalState(
      () => fakeJudge({}),
      () => [],
    );

    expect(state.hasPlatformVersions('system')).toBe(false);
    expect(state.platformVersionsOf('system')).toEqual([]);
  });

  test('re-judges every module when the core or the system is chosen', async () => {
    const { state, judge } = await loadedVersions(
      { dice: ['1.0.0'] },
      { platforms: { core: ['14.368', '14.370'], system: ['5.1.0', '5.2.0'] } },
    );
    expect(state.chosen('dice')).toBeDefined();
    expect(state.platformChosen('core')).toBeUndefined();
    const judged = judge.judgeChoices.mock.calls.length;

    state.choosePlatform('core', '14.370');
    flushSync();
    expect(state.chosen('dice')).toBeDefined();
    state.choosePlatform('system', '5.2.0');
    flushSync();
    expect(state.chosen('dice')).toBeDefined();

    expect(judge.judgeChoices.mock.calls.length).toBe(judged + 2);
    expect(judge.judgeChoices.mock.lastCall?.[1]).toMatchObject({ core: '14.370', system: '5.2.0' });
    expect(state.platformChosen('core')).toBe('14.370');
    expect(state.platformChosen('system')).toBe('5.2.0');
    state.versionsOf('dice');
    expect(judge.judgeVersions.mock.lastCall?.[1]).toMatchObject({ core: '14.370', system: '5.2.0' });
    state.platformVersionsOf('core');
    expect(judge.judgePlatform.mock.lastCall?.[1]).toMatchObject({ core: '14.370', system: '5.2.0' });
    expect(judge.judgePlatform.mock.lastCall?.[2]).toBe('core');
  });

  test('says whether versions are looked up through a proxy once the lookup starts', async () => {
    const state = new HypotheticalState(
      () => fakeJudge({}, { proxied: false }),
      () => [],
    );
    expect(state.proxied).toBeNull();

    await state.load();

    expect(state.proxied).toBe(false);
  });

  test('reports on the setup chosen once versions are looked up, and not while more are', async () => {
    const judge = fakeJudge({ dice: ['1.0.0', '2.0.0'] });
    const state = new HypotheticalState(
      () => judge,
      () => ['dice'],
    );
    expect(state.canReport).toBe(false);
    expect(state.report()).toBeNull();
    await state.load();
    state.choose('dice', '2.0.0');
    state.choosePlatform('system', '5.2.0');

    expect(state.canReport).toBe(true);
    const report = state.report();

    expect(report?.check.setup.modules).toBe(1);
    await expect(report?.solve).resolves.toEqual({ solution: { kind: 'found', changes: [] }, unloaded: [] });
    expect(judge.reportCheck.mock.lastCall?.[0]).toEqual(['dice']);
    expect(judge.reportSolve.mock.lastCall?.[1]).toMatchObject({ system: '5.2.0' });
    expect([...(judge.reportSolve.mock.lastCall?.[1].modules ?? [])]).toEqual([['dice', '2.0.0']]);
  });

  test('chooses the versions an update recommends, leaving every other choice as it is', async () => {
    const { state, judge } = await loadedVersions({ dice: ['1.0.0', '2.0.0'], lib: ['1.0.0', '3.0.0'] });
    state.choose('dice', '2.0.0');
    const report = state.report();

    const after = report?.apply([
      { package: { type: 'core', id: 'core' }, title: 'Foundry', from: '14.368', to: '14.369' },
      { package: { type: 'system', id: 'dnd5e' }, title: 'D&D', from: '5.1.0', to: '5.2.0' },
      { package: { type: 'module', id: 'lib' }, title: 'Lib', from: '1.0.0', to: '3.0.0' },
      { package: { type: 'module', id: 'helper' }, title: 'Helper', from: null, to: '1.0.0' },
    ]);
    flushSync();

    expect(state.platformChosen('core')).toBe('14.369');
    expect(state.platformChosen('system')).toBe('5.2.0');
    expect(state.chosen('lib')?.version).toBe('3.0.0');
    expect(state.chosen('dice')?.version).toBe('2.0.0');
    expect([...(judge.judgeChoices.mock.lastCall?.[1].modules ?? [])]).toEqual([
      ['dice', '2.0.0'],
      ['lib', '3.0.0'],
      ['helper', '1.0.0'],
    ]);
    // A report on the setup the versions chosen make.
    expect(after?.check.modules.find(({ id }) => id === 'lib')?.version).toBe('3.0.0');
    expect(judge.reportPlan.mock.lastCall?.[1]).toMatchObject({ core: '14.369', system: '5.2.0' });
  });

  test('knows whether any version is chosen, and forgets them all', async () => {
    const { state } = await loadedVersions({ dice: ['1.0.0', '2.0.0'] });
    expect(state.hasChoices).toBe(false);

    state.choose('dice', '2.0.0');
    expect(state.hasChoices).toBe(true);
    state.clearChoices();
    expect(state.hasChoices).toBe(false);
    state.choosePlatform('core', '14.369');
    expect(state.hasChoices).toBe(true);
    state.clearChoices();
    state.choosePlatform('system', '5.2.0');
    expect(state.hasChoices).toBe(true);

    state.clearChoices();
    flushSync();

    expect(state.hasChoices).toBe(false);
    expect(state.platformChosen('core')).toBeUndefined();
    expect(state.platformChosen('system')).toBeUndefined();
    expect(state.chosen('dice')?.version).toBe('1.0.0');
  });

  test('cannot report while a further lookup runs', async () => {
    const active = new SvelteSet(['dice']);
    const judge = fakeJudge({ dice: ['1.0.0'], lib: ['1.0.0'] });
    const state = new HypotheticalState(
      () => judge,
      () => active,
    );
    await state.load();
    expect(state.canReport).toBe(true);
    judge.lookUp.mockReturnValue(new Promise(() => undefined));

    active.add('lib');
    void state.load();

    expect(state.canReport).toBe(false);
  });

  test('passes on the packages not reached', async () => {
    const { state } = await loadedVersions({}, { unreached: [{ type: 'module', id: 'dice' }] });

    expect(state.unreached).toEqual([{ type: 'module', id: 'dice' }]);
  });

  describe('with modules ignored', () => {
    test('never looks an ignored module up, and does once it is no longer ignored', async () => {
      const judge = fakeJudge({ dice: ['1.0.0'], synth: ['0.0.1'] });
      const ignored = new SvelteSet(['synth']);
      const state = new HypotheticalState(
        () => judge,
        () => ['dice', 'synth'],
        () => ignored,
      );

      await state.load();
      expect(judge.lookUp).toHaveBeenCalledExactlyOnceWith(['dice']);

      ignored.delete('synth');
      await state.load();
      expect(judge.lookUp).toHaveBeenLastCalledWith(['synth']);
    });

    test('gives the judge the modules ignored with every choice, and says which they are', async () => {
      const judge = fakeJudge({ dice: ['1.0.0'], synth: ['0.0.1'] });
      const ignored = new SvelteSet(['synth']);
      const state = new HypotheticalState(
        () => judge,
        () => ['dice', 'synth'],
        () => ignored,
      );
      await state.load();

      state.versionsOf('dice');
      expect([...(judge.judgeVersions.mock.lastCall?.[1].ignored ?? [])]).toEqual(['synth']);
      expect(state.isIgnored('synth')).toBe(true);
      expect(state.isIgnored('dice')).toBe(false);
    });

    test('ignores nothing unless told', async () => {
      const judge = fakeJudge({ dice: ['1.0.0'] });
      const state = new HypotheticalState(
        () => judge,
        () => ['dice'],
      );
      await state.load();

      expect(state.isIgnored('dice')).toBe(false);
      flushSync();
    });
  });
});
