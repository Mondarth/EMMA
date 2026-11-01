import { describe, expect, test, vi } from 'vitest';

import type { CoreUpdater } from '../../../src/app/setup-state.svelte';
import { SetupState } from '../../../src/app/setup-state.svelte';
import type { PendingPlan } from '../../../src/foundry/preferences';
import type { Overview } from '../../../src/lib/overview';
import { buildOverview } from '../../../src/lib/overview';
import type { RunStep } from '../../../src/lib/run';
import type { PackageUpdate } from '../../../src/lib/updates';
import { alone, installation, noInstall, noUpdates, unjudged } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(installation(), new Map());

describe('SetupState', () => {
  test('reads the installation, saying while it does', async () => {
    let finish = (): void => undefined;
    const setup = new SetupState({
      load: () =>
        new Promise(resolve => {
          finish = () => {
            resolve(OVERVIEW);
          };
        }),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
    });

    const reading = setup.refresh();
    expect(setup.loading).toBe(true);
    finish();
    await reading;

    expect(setup.loading).toBe(false);
    expect(setup.overview).toEqual(OVERVIEW);
    expect(setup.failed).toBe(false);
  });

  test('keeps a failure rather than throwing it, and clears it on the next reading', async () => {
    const load = vi.fn<() => Promise<typeof OVERVIEW>>().mockRejectedValueOnce(new Error('offline'));
    load.mockResolvedValueOnce(OVERVIEW);
    const setup = new SetupState({
      load,
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
    });

    await setup.refresh();
    expect(setup.failed).toBe(true);
    expect(setup.loading).toBe(false);

    await setup.refresh();
    expect(setup.failed).toBe(false);
  });

  test('starts with the guard as kept, and passes each switch on', () => {
    const onGuardChange = vi.fn();
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: false,
      onGuardChange,
      findUpdates: noUpdates,
      installModule: noInstall,
    });
    expect(setup.guardOn).toBe(false);

    setup.setGuardOn(true);

    expect(setup.guardOn).toBe(true);
    expect(onGuardChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  test('installs the EMMA module, once at a time, then reads the installation afresh', async () => {
    let finish = (): void => undefined;
    const installModule = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const load = vi.fn(() => Promise.resolve(OVERVIEW));
    const setup = new SetupState({
      load,
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule,
    });

    const installing = setup.installModule();
    expect(setup.installing).toBe(true);
    await setup.installModule();
    finish();
    await installing;

    expect(installModule).toHaveBeenCalledOnce();
    expect(setup.installing).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  test('reads the installation afresh after a failed install too, which Foundry reports', async () => {
    const load = vi.fn(() => Promise.resolve(OVERVIEW));
    const setup = new SetupState({
      load,
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: () => Promise.reject(new Error('offline')),
    });

    await setup.installModule();

    expect(setup.installing).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  test('asks for the space a snapshot needs once, until the installation is read again, keeping a failure', async () => {
    const snapshotSpace = vi
      .fn<() => Promise<{ required: number; available: number }>>()
      .mockResolvedValueOnce({ required: 1, available: 2 })
      .mockRejectedValueOnce(new Error('down'));
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
      snapshotSpace,
    });

    const asking = setup.checkSnapshotSpace();
    expect(setup.snapshotSpace).toBe('checking');
    await asking;
    await setup.checkSnapshotSpace();
    expect(setup.snapshotSpace).toEqual({ required: 1, available: 2 });
    expect(snapshotSpace).toHaveBeenCalledOnce();

    await setup.refresh();
    expect(setup.snapshotSpace).toBeNull();
    await setup.checkSnapshotSpace();
    expect(setup.snapshotSpace).toBe('failed');
  });

  test('cannot ask for the space a snapshot needs without a way to', async () => {
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
    });

    await setup.checkSnapshotSpace();

    expect(setup.snapshotSpace).toBeNull();
  });

  describe('running the plan', () => {
    const APP: PackageUpdate = { key: 'module:app', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };
    const LIB: PackageUpdate = { key: 'module:lib', installed: '1.0.0', newest: '1.1.0', versions: ['1.1.0', '1.0.0'] };
    const CORE: PackageUpdate = { key: 'core', installed: '14.368', newest: '14.369', versions: ['14.369', '14.368'] };

    /**
     * A state whose search finds some updates, with versions chosen of them.
     * @param runStep - How a step is carried out
     * @param choices - The versions chosen, as `[key, version]`
     * @returns The state, and how often the installation was read
     */
    async function planned(
      runStep: ((step: Exclude<RunStep, { kind: 'core' }>) => Promise<void>) | undefined,
      choices: readonly (readonly [string, string])[],
    ) {
      const load = vi.fn(() => Promise.resolve(OVERVIEW));
      const setup = new SetupState({
        load,
        guardOn: true,
        onGuardChange: vi.fn(),
        findUpdates: () =>
          Promise.resolve({
            updates: new Map([APP, LIB, CORE].map(update => [update.key, update])),
            blocked: new Map(),
            unresolved: [],
            judge: unjudged,
            planner: alone(APP, LIB, CORE),
          }),
        installModule: noInstall,
        ...(runStep !== undefined && { runStep }),
      });
      await setup.refresh();
      await vi.waitFor(() => {
        expect(setup.updates.status).toBe('found');
      });
      for (const [key, version] of choices) await setup.updates.choose(key, version);
      return { setup, load };
    }

    test('makes the snapshot checked, then each change, in order, the choices fixed meanwhile, then reads again', async () => {
      const seen: string[] = [];
      const running: { setup?: SetupState } = {};
      const runStep = vi.fn((step: Exclude<RunStep, { kind: 'core' }>) => {
        seen.push(`${step.key} ${String(running.setup?.running)} ${String(running.setup?.updates.locked)}`);
        return Promise.resolve();
      });
      const { setup, load } = await planned(runStep, [
        ['module:app', '2.0.0'],
        ['module:lib', '1.1.0'],
      ]);
      running.setup = setup;
      setup.updates.setSafeguard('snapshot', { checked: true, note: 'Mine' });
      expect(setup.canRun).toBe(true);

      await setup.runPlan();

      expect(seen).toEqual(['snapshot true true', 'module:app true true', 'module:lib true true']);
      expect(runStep).toHaveBeenNthCalledWith(1, { kind: 'snapshot', key: 'snapshot', note: 'Mine' });
      expect(setup.run).toMatchObject({
        over: true,
        states: { snapshot: 'done', 'module:app': 'done', 'module:lib': 'done' },
      });
      expect(setup.run?.failure).toBeUndefined();
      expect(setup.running).toBe(false);
      expect(setup.updates.locked).toBe(false);
      expect(load).toHaveBeenCalledTimes(2);
    });

    test('stops at the first step that fails, saying why, leaving the rest', async () => {
      const runStep = vi.fn((step: Exclude<RunStep, { kind: 'core' }>) =>
        step.key === 'module:app' ? Promise.reject(new Error('The download failed')) : Promise.resolve(),
      );
      const { setup } = await planned(runStep, [
        ['module:app', '2.0.0'],
        ['module:lib', '1.1.0'],
      ]);

      await setup.runPlan();

      expect(runStep).toHaveBeenCalledOnce();
      expect(setup.run).toMatchObject({
        over: true,
        states: { 'module:app': 'failed', 'module:lib': 'waiting' },
        failure: { step: { key: 'module:app' }, message: 'The download failed' },
      });
    });

    test('words a failure that is not an error', async () => {
      // What Foundry rejects with is not known to be an error.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      const { setup } = await planned(() => Promise.reject('x'), [['module:app', '2.0.0']]);

      await setup.runPlan();

      expect(setup.run?.failure?.message).toBe('x');
    });

    test("stops before Foundry VTT's own update, once the snapshot recommended for it is made", async () => {
      const runStep = vi.fn(() => Promise.resolve());
      const { setup } = await planned(runStep, [
        ['core', '14.369'],
        ['module:app', '2.0.0'],
      ]);

      await setup.runPlan();

      expect(runStep).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'snapshot' }));
      expect(setup.run).toMatchObject({
        over: true,
        beforeCore: '14.369',
        states: { snapshot: 'done', core: 'waiting', 'module:app': 'waiting' },
      });
    });

    test('runs once at a time, and not at all without a way to', async () => {
      let finish = (): void => undefined;
      const runStep = vi.fn(
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          }),
      );
      const { setup } = await planned(runStep, [['module:app', '2.0.0']]);
      const first = setup.runPlan();
      await setup.runPlan();
      // Nor can the choices change meanwhile.
      await expect(setup.updates.choose('module:lib', '1.1.0')).resolves.toBe(false);
      setup.updates.clear();
      expect(setup.updates.choices).toHaveLength(1);
      finish();
      await first;
      expect(runStep).toHaveBeenCalledOnce();

      const { setup: unable } = await planned(undefined, [['module:app', '2.0.0']]);
      expect(unable.canRun).toBe(false);
      await unable.runPlan();
      expect(unable.run).toBeNull();
    });
  });

  describe('updating Foundry VTT in place', () => {
    const APP: PackageUpdate = { key: 'module:app', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };
    const CORE: PackageUpdate = { key: 'core', installed: '14.368', newest: '14.369', versions: ['14.369', '14.368'] };

    /**
     * Foundry's updater, finding a build.
     * @param target - What it would install
     * @returns The updater
     */
    const updater = (target: Awaited<ReturnType<CoreUpdater['check']>>): CoreUpdater => ({
      state: () => ({ canUpdate: true, channel: 'stable' }),
      check: vi.fn(() => Promise.resolve(target)),
      update: vi.fn(() => Promise.resolve()),
    });

    /**
     * A state whose plan updates Foundry VTT and a module, run up to Foundry's update.
     * @param core - Foundry's updater
     * @param kept - Where the plan kept for after the update goes
     * @returns The state
     */
    async function stopped(core: CoreUpdater | undefined, kept: (PendingPlan | null)[] = []) {
      const setup = new SetupState({
        load: () => Promise.resolve(OVERVIEW),
        guardOn: true,
        onGuardChange: vi.fn(),
        findUpdates: () =>
          Promise.resolve({
            updates: new Map([APP, CORE].map(update => [update.key, update])),
            blocked: new Map(),
            unresolved: [],
            judge: unjudged,
            planner: alone(APP, CORE),
          }),
        installModule: noInstall,
        runStep: () => Promise.resolve(),
        ...(core !== undefined && { core }),
        keepPendingPlan: plan => {
          kept.push(plan);
          return true;
        },
      });
      await setup.refresh();
      await vi.waitFor(() => {
        expect(setup.updates.status).toBe('found');
      });
      await setup.updates.choose('core', '14.369');
      await setup.updates.choose('module:app', '2.0.0');
      await setup.runPlan();
      expect(setup.run?.beforeCore).toBe('14.369');
      return setup;
    }

    test('asks once which build the updater would install, keeping a failure', async () => {
      const core = updater({ version: '14.369', manual: false });
      const setup = await stopped(core);
      expect(setup.coreUpdate).toEqual({ canUpdate: true, channel: 'stable' });

      const asking = setup.checkCoreTarget();
      expect(setup.coreTarget).toBe('checking');
      await asking;
      await setup.checkCoreTarget();
      expect(setup.coreTarget).toEqual({ version: '14.369', manual: false });
      expect(core.check).toHaveBeenCalledOnce();

      vi.mocked(core.check).mockRejectedValueOnce(new Error('offline'));
      await setup.refresh();
      expect(setup.coreTarget).toBeNull();
      await setup.checkCoreTarget();
      expect(setup.coreTarget).toBe('failed');
    });

    test('keeps the rest of the plan, then starts the update', async () => {
      const kept: (PendingPlan | null)[] = [];
      const core = updater({ version: '14.369', manual: false });
      const setup = await stopped(core, kept);
      await setup.checkCoreTarget();

      await setup.updateCoreInPlace();

      expect(kept).toEqual([{ core: '14.369', picks: [['module:app', '2.0.0']] }]);
      expect(core.update).toHaveBeenCalledOnce();
      expect(setup.coreUpdating).toEqual({ kind: 'begun', version: '14.369', kept: true });
    });

    test('forgets the plan kept when Foundry does not update, saying why', async () => {
      const kept: (PendingPlan | null)[] = [];
      const core = updater({ version: '14.369', manual: false });
      vi.mocked(core.update).mockRejectedValueOnce(new Error('Not allowed'));
      const setup = await stopped(core, kept);
      await setup.checkCoreTarget();

      await setup.updateCoreInPlace();

      expect(kept).toEqual([expect.objectContaining({ core: '14.369' }), null]);
      expect(setup.coreUpdating).toEqual({ kind: 'failed', message: 'Not allowed' });
    });

    test.each([
      ['the updater would install another build', { version: '14.370', manual: false }],
      ['the build is installed only by hand', { version: '14.369', manual: true }],
      ['there is no build to update to', { none: 'Up to date' }],
    ] as const)('updates nothing when %s', async (_label, target) => {
      const core = updater(target);
      const setup = await stopped(core);
      await setup.checkCoreTarget();

      await setup.updateCoreInPlace();

      expect(core.update).not.toHaveBeenCalled();
      expect(setup.coreUpdating).toBeNull();
    });

    test('updates nothing before it knows the build, nor without an updater', async () => {
      const core = updater({ version: '14.369', manual: false });
      const setup = await stopped(core);
      await setup.updateCoreInPlace();
      expect(core.update).not.toHaveBeenCalled();

      const without = await stopped(undefined);
      expect(without.coreUpdate).toEqual({ canUpdate: false, channel: 'stable' });
      await without.checkCoreTarget();
      expect(without.coreTarget).toBeNull();
      await without.updateCoreInPlace();
      expect(without.coreUpdating).toBeNull();
    });

    /**
     * A state that reads an installation, with a plan kept from before Foundry VTT's update.
     * @param overview - The installation
     * @param keepPendingPlan - Where the plan kept is forgotten
     * @returns The state, once its search is done
     */
    async function readOn(overview: Overview, keepPendingPlan: (plan: PendingPlan | null) => boolean) {
      const setup = new SetupState({
        load: () => Promise.resolve(overview),
        guardOn: true,
        onGuardChange: vi.fn(),
        findUpdates: () =>
          Promise.resolve({
            updates: new Map([[APP.key, APP]]),
            blocked: new Map(),
            unresolved: [],
            judge: unjudged,
            planner: alone(APP),
          }),
        installModule: noInstall,
        pendingPlan: () => ({ core: '14.369', picks: [['module:app', '2.0.0']] }),
        keepPendingPlan,
      });
      await setup.refresh();
      await vi.waitFor(() => {
        expect(setup.updates.status).toBe('found');
      });
      return setup;
    }

    test('restores the plan kept once Foundry VTT is on the build updated to, and forgets it', async () => {
      const keepPendingPlan = vi.fn(() => true);
      const setup = await readOn(buildOverview(installation({ core: '14.369' }), new Map()), keepPendingPlan);

      await vi.waitFor(() => {
        expect(setup.resumedOn).toBe('14.369');
      });
      expect(setup.updates.picks).toEqual([['module:app', '2.0.0']]);
      expect(keepPendingPlan).toHaveBeenCalledExactlyOnceWith(null);
    });

    test('keeps the plan kept while Foundry VTT is on another build', async () => {
      const keepPendingPlan = vi.fn(() => true);
      const setup = await readOn(OVERVIEW, keepPendingPlan);

      expect(setup.resumedOn).toBeNull();
      expect(keepPendingPlan).not.toHaveBeenCalled();
    });
  });
});
