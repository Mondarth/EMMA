import { describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import { buildOverview } from '../../../src/lib/overview';
import { installation, noInstall, noUpdates } from '../../mocks/fixtures';

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
});
