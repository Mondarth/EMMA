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
  test("reads Foundry's listings once each, keeping a failure, and installs only where it can list and run", async () => {
    const listPackages = vi
      .fn<(type: 'module' | 'system') => Promise<never[]>>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('offline'));
    const options = {
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
    };
    const setup = new SetupState({ ...options, listPackages, runStep: () => Promise.resolve() });
    expect(setup.canInstall).toBe(true);

    const reading = setup.loadListing('module');
    expect(setup.listings.module).toBe('loading');
    await reading;
    await setup.loadListing('module');
    await setup.loadListing('system');

    expect(setup.listings).toEqual({ module: [], system: 'failed' });
    expect(listPackages).toHaveBeenCalledTimes(2);

    const without = new SetupState({ ...options, listPackages });
    expect(without.canInstall).toBe(false);
    const unlisted = new SetupState(options);
    await unlisted.loadListing('module');
    expect(unlisted.listings.module).toBeNull();
  });

  test('narrows each listing as the user says, hiding old packages and premium ones not owned at first', () => {
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
    });
    expect(setup.installFilters.module).toEqual({ hideBehind: true, showUnowned: false, offTags: [] });

    setup.setInstallFilters('module', { showUnowned: true });

    expect(setup.installFilters).toEqual({
      module: { hideBehind: true, showUnowned: true, offTags: [] },
      system: { hideBehind: true, showUnowned: false, offTags: [] },
    });
  });

  test('locks a package only where it can, while no plan runs, reading the installation again once it has', async () => {
    const load = vi.fn(() => Promise.resolve(OVERVIEW));
    const options = { load, guardOn: true, onGuardChange: vi.fn(), findUpdates: noUpdates, installModule: noInstall };
    const without = new SetupState(options);
    expect(without.canLock).toBe(false);
    await expect(without.setLocked('module:lib', true)).resolves.toBe(false);

    const lockPackage = vi.fn(() => Promise.resolve());
    const setup = new SetupState({ ...options, lockPackage });
    expect(setup.canLock).toBe(true);
    await expect(setup.setLocked('system:dnd5e', true)).resolves.toBe(true);
    expect(lockPackage).toHaveBeenCalledWith('system', 'dnd5e', true);
    expect(load).toHaveBeenCalledOnce();

    setup.updates.locked = true;
    await expect(setup.setLocked('module:lib', false)).resolves.toBe(false);
    setup.updates.locked = false;
    lockPackage.mockRejectedValueOnce(new Error('No such package'));
    await expect(setup.setLocked('module:lib', false)).resolves.toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  test('locks Foundry VTT in EMMA only where it can, while no plan runs, reading the installation again', async () => {
    const load = vi.fn(() => Promise.resolve(OVERVIEW));
    const options = { load, guardOn: true, onGuardChange: vi.fn(), findUpdates: noUpdates, installModule: noInstall };
    const without = new SetupState(options);
    expect(without.canLockCore).toBe(false);
    await expect(without.setCoreLocked(true)).resolves.toBe(false);

    const lockCore = vi.fn();
    const setup = new SetupState({ ...options, lockCore });
    expect(setup.canLockCore).toBe(true);
    await expect(setup.setCoreLocked(true)).resolves.toBe(true);
    expect(lockCore).toHaveBeenCalledWith(true);
    expect(load).toHaveBeenCalledOnce();

    setup.updates.locked = true;
    await expect(setup.setCoreLocked(false)).resolves.toBe(false);
    expect(lockCore).toHaveBeenCalledOnce();
  });

  test('ignores a world, a game system or a module only where it can, while no plan runs, reading again', async () => {
    const load = vi.fn(() => Promise.resolve(OVERVIEW));
    const options = { load, guardOn: true, onGuardChange: vi.fn(), findUpdates: noUpdates, installModule: noInstall };
    const without = new SetupState(options);
    expect(without.canIgnore).toBe(false);
    await expect(without.setIgnored('module:lib', true)).resolves.toBe(false);

    const ignore = vi.fn();
    const setup = new SetupState({ ...options, ignore });
    expect(setup.canIgnore).toBe(true);
    await expect(setup.setIgnored('world:a', true)).resolves.toBe(true);
    expect(ignore).toHaveBeenCalledWith('world:a', true);
    expect(load).toHaveBeenCalledOnce();

    setup.updates.locked = true;
    await expect(setup.setIgnored('world:a', false)).resolves.toBe(false);
    expect(ignore).toHaveBeenCalledOnce();
  });

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

    test('shows a run while it runs, and once over until the user changes the plan, a new search aside', async () => {
      const { setup } = await planned(() => Promise.resolve(), [['module:app', '2.0.0']]);
      expect(setup.shownRun).toBeNull();

      await setup.runPlan();
      // Read again, the installation is searched again, which changes nothing the user did.
      await vi.waitFor(() => {
        expect(setup.updates.status).toBe('found');
      });
      expect(setup.shownRun).toMatchObject({ over: true });

      await setup.updates.choose('module:lib', '1.1.0');
      expect(setup.shownRun).toBeNull();
      expect(setup.run).toMatchObject({ over: true });
    });

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
     * @param stores - Whether the browser stores it
     * @returns The state
     */
    async function stopped(core: CoreUpdater | undefined, kept: (PendingPlan | null)[] = [], stores = true) {
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
          return stores;
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

    test('keeps the rest of the plan as the run stops, as Foundry may be updated by other means, then updates', async () => {
      const kept: (PendingPlan | null)[] = [];
      const core = updater({ version: '14.369', manual: false });
      const setup = await stopped(core, kept);

      // Kept as the run starts, after each step, then as it stops, before anything else is done, as in a container,
      // where Foundry's updater is never used.
      expect(kept[0]).toEqual({
        picks: [
          ['core', '14.369'],
          ['module:app', '2.0.0'],
        ],
      });
      expect(kept.at(-1)).toEqual({ core: '14.369', picks: [['module:app', '2.0.0']] });
      expect(setup.run?.kept).toBe(true);
      const saves = kept.length;

      await setup.checkCoreTarget();
      await setup.updateCoreInPlace();

      expect(kept).toHaveLength(saves);
      expect(core.update).toHaveBeenCalledOnce();
      expect(setup.coreUpdating).toEqual({ kind: 'begun', version: '14.369', kept: true });
    });

    test('says when the browser would not keep the rest of the plan', async () => {
      const core = updater({ version: '14.369', manual: false });
      const setup = await stopped(core, [], false);
      expect(setup.run?.kept).toBe(false);

      await setup.checkCoreTarget();
      await setup.updateCoreInPlace();

      expect(setup.coreUpdating).toEqual({ kind: 'begun', version: '14.369', kept: false });
    });

    test('keeps the plan kept when Foundry does not update, saying why', async () => {
      const kept: (PendingPlan | null)[] = [];
      const core = updater({ version: '14.369', manual: false });
      vi.mocked(core.update).mockRejectedValueOnce(new Error('Not allowed')).mockRejectedValueOnce('Offline');
      const setup = await stopped(core, kept);
      await setup.checkCoreTarget();

      await setup.updateCoreInPlace();

      expect(kept.at(-1)).toEqual(expect.objectContaining({ core: '14.369' }));
      expect(kept).not.toContain(null);
      expect(setup.coreUpdating).toEqual({ kind: 'failed', message: 'Not allowed' });
      await setup.updateCoreInPlace();
      expect(setup.coreUpdating).toEqual({ kind: 'failed', message: 'Offline' });
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
     * @param picks - The choices kept
     * @returns The state, once its search is done
     */
    async function readOn(
      overview: Overview,
      keepPendingPlan: (plan: PendingPlan | null) => boolean,
      picks: PendingPlan['picks'] = [['module:app', '2.0.0']],
    ) {
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
        pendingPlan: () => ({ core: '14.369', picks }),
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
        expect(setup.resumed).toEqual({ core: '14.369' });
      });
      expect(setup.updates.picks).toEqual([['module:app', '2.0.0']]);
      expect(keepPendingPlan).toHaveBeenCalledExactlyOnceWith(null);
    });

    test.each(['14.371', '15.300'])(
      'restores it on a later build too, as on %s, as a container may be updated past it',
      async core => {
        const keepPendingPlan = vi.fn(() => true);
        const setup = await readOn(buildOverview(installation({ core }), new Map()), keepPendingPlan);

        await vi.waitFor(() => {
          expect(setup.resumed).toEqual({ core: '14.369' });
        });
        expect(setup.updates.picks).toEqual([['module:app', '2.0.0']]);
      },
    );

    test('takes a build named otherwise than generation.build as only itself', async () => {
      const keepPendingPlan = vi.fn(() => true);
      const setup = await readOn(buildOverview(installation({ core: '14.369-dev' }), new Map()), keepPendingPlan);

      expect(setup.resumed).toBeNull();
      expect(keepPendingPlan).not.toHaveBeenCalled();
    });

    test('names the choices it could not restore, as no longer offered, and forgets the plan all the same', async () => {
      const keepPendingPlan = vi.fn(() => true);
      const setup = await readOn(buildOverview(installation({ core: '14.369' }), new Map()), keepPendingPlan, [
        ['module:app', '9.9.9'],
      ]);

      await vi.waitFor(() => {
        expect(setup.resumed).toEqual({ core: '14.369' });
      });
      expect(setup.unrestored).toEqual(['module:app']);
      expect(setup.updates.picks).toEqual([]);
      expect(keepPendingPlan).toHaveBeenCalledExactlyOnceWith(null);
    });

    test('keeps what is left of the plan as a step fails, and forgets it once every step is done', async () => {
      const kept: (PendingPlan | null)[] = [];
      let fail = true;
      const setup = new SetupState({
        load: () => Promise.resolve(OVERVIEW),
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
        runStep: step => (fail && step.kind === 'install' ? Promise.reject(new Error('Refused')) : Promise.resolve()),
        keepPendingPlan: plan => {
          kept.push(plan);
          return true;
        },
        pendingPlan: () => kept.at(-1) ?? undefined,
      });
      await setup.refresh();
      await vi.waitFor(() => {
        expect(setup.updates.status).toBe('found');
      });
      await setup.updates.choose('module:app', '2.0.0');

      await setup.runPlan();
      expect(kept.at(-1)).toEqual({ picks: [['module:app', '2.0.0']] });
      // Its plan is still here, so it is not offered again in this visit.
      expect(setup.savedPlan).toBeNull();

      fail = false;
      await setup.runPlan();
      expect(kept.at(-1)).toBeNull();
    });

    test('offers a plan a run did not finish on a later visit, to resume or discard', async () => {
      const keepPendingPlan = vi.fn(() => true);
      const setup = await readOn(OVERVIEW, keepPendingPlan, [['module:app', '2.0.0']]);
      // As readOn keeps the plan with a build, one without is read on another visit.
      const saved = { picks: [['module:app', '2.0.0']] as const };
      const later = new SetupState({
        load: () => Promise.resolve(OVERVIEW),
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
        pendingPlan: () => saved,
        keepPendingPlan,
      });
      await later.refresh();
      await vi.waitFor(() => {
        expect(later.savedPlan).toEqual(saved);
      });

      await later.resumeSaved();
      expect(later.savedPlan).toBeNull();
      expect(later.resumed).toEqual({});
      expect(later.updates.picks).toEqual([['module:app', '2.0.0']]);
      // Nothing more to resume.
      await later.resumeSaved();

      setup.savedPlan = saved;
      setup.discardSaved();
      expect(setup.savedPlan).toBeNull();
      expect(keepPendingPlan).toHaveBeenLastCalledWith(null);
    });

    test('restores choices one by one when they cannot be planned together, and none while the plan runs', async () => {
      const setup = await readOn(
        OVERVIEW,
        vi.fn(() => true),
      );
      const search = setup.updates.search;
      if (search === null) throw new Error('No search');
      vi.spyOn(search.planner, 'plan').mockResolvedValueOnce(undefined);

      await expect(setup.updates.restore([['module:app', '2.0.0']])).resolves.toEqual([]);
      expect(setup.updates.picks).toEqual([['module:app', '2.0.0']]);
      // One by one, a version no longer offered is refused still.
      vi.mocked(search.planner.plan).mockResolvedValueOnce(undefined);
      await expect(setup.updates.restore([['module:app', '9.9.9']])).resolves.toEqual(['module:app']);

      setup.updates.locked = true;
      await expect(setup.updates.restore([['module:app', '2.0.0']])).resolves.toEqual(['module:app']);
    });

    test('keeps the plan kept while Foundry VTT is on another build', async () => {
      const keepPendingPlan = vi.fn(() => true);
      const setup = await readOn(OVERVIEW, keepPendingPlan);

      expect(setup.resumed).toBeNull();
      expect(setup.savedPlan).toBeNull();
      expect(keepPendingPlan).not.toHaveBeenCalled();
    });
  });
});
