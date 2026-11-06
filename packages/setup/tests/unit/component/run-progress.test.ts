import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { RunStep, StepProgress } from '../../../src/lib/run';
import type { PackageUpdate } from '../../../src/lib/updates';
import { alone, installation, installedModule, noInstall, unjudged } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({ modules: [installedModule('lib', 'Library', '1.0.0'), installedModule('old', 'Old', '1.0.0')] }),
  new Map(),
);
const LIB: PackageUpdate = { key: 'module:lib', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };
const OLD: PackageUpdate = { key: 'module:old', installed: '1.0.0', newest: '1.1.0', versions: ['1.1.0', '1.0.0'] };

/** A run step held until it is let go, telling how far it has got as it is told to. */
interface Held {
  readonly step: Exclude<RunStep, { kind: 'core' }>;
  readonly tell: (progress: StepProgress) => void;
  readonly finish: () => void;
  readonly fail: () => void;
}

/**
 * Render EMMA's window with Library and Old chosen to update, and run the plan, each step held until let go.
 * @param options - What else the plan has
 * @param options.snapshot - Whether it makes a snapshot first
 * @returns The steps as they start, and the plan's region
 */
async function running({ snapshot = false } = {}) {
  const held: Held[] = [];
  const runStep = vi.fn(
    (step: Exclude<RunStep, { kind: 'core' }>, onProgress?: (progress: StepProgress) => void) =>
      new Promise<void>((resolve, reject) => {
        held.push({
          step,
          tell: progress => onProgress?.(progress),
          finish: resolve,
          fail: () => {
            reject(new Error('The server refused it'));
          },
        });
      }),
  );
  const setup = new SetupState({
    load: () => Promise.resolve(OVERVIEW),
    guardOn: true,
    onGuardChange: vi.fn(),
    findUpdates: () =>
      Promise.resolve({
        updates: new Map([LIB, OLD].map(update => [update.key, update])),
        blocked: new Map(),
        unresolved: [],
        judge: unjudged,
        planner: alone(LIB, OLD),
      }),
    installModule: noInstall,
    runStep,
  });
  await setup.refresh();
  await vi.waitFor(() => {
    expect(setup.updates.status).toBe('found');
  });
  await setup.updates.choose('module:lib', '2.0.0');
  await setup.updates.choose('module:old', '1.1.0');
  setup.updates.setSafeguard('snapshot', { checked: snapshot });
  render(SetupRoot, { setup });
  const user = userEvent.setup();
  const plan = await screen.findByRole('region', { name: 'Update plan' });
  await user.click(within(plan).getByRole('button', { name: 'Run plan' }));
  await user.click(within(plan).getByRole('button', { name: 'Run' }));
  await vi.waitFor(() => {
    expect(held).toHaveLength(1);
  });
  const changes = within(within(plan).getByRole('table', { name: 'Changes' }));
  const rowOf = (name: string) => changes.getByRole('rowheader', { name: new RegExp(`^${name}`) });
  return { held, plan, rowOf };
}

describe("a plan's run, step by step", () => {
  test('says how far an install has downloaded, then installed, with a bar below its name, underlined when done', async () => {
    const { held, rowOf } = await running();
    const [first] = held;
    const lib = rowOf('Library');
    // Before Foundry says how far, a spinner.
    expect(lib).toHaveTextContent('Running…');
    expect(within(lib).queryByRole('progressbar')).toBeNull();

    first?.tell({ phase: 'download', pct: 42 });
    await vi.waitFor(() => {
      expect(lib).toHaveTextContent('Downloading 42%');
    });
    const downloading = within(lib).getByRole('progressbar', { name: 'Downloading Library' });
    expect(downloading).toHaveAttribute('aria-valuenow', '42');
    expect(downloading.querySelector('.emma-plan-bar-download')).toHaveStyle({ width: '42%' });
    expect(downloading.querySelector('.emma-plan-bar-install')).toBeNull();
    expect(lib.querySelector('.fa-spinner')).toBeNull();

    first?.tell({ phase: 'install', pct: 70 });
    await vi.waitFor(() => {
      expect(lib).toHaveTextContent('Installing 70%');
    });
    const installing = within(lib).getByRole('progressbar', { name: 'Installing Library' });
    // The download is done, so its bar is full; the install's is over it, as far as it has got.
    expect(installing.querySelector('.emma-plan-bar-download')).toHaveStyle({ width: '100%' });
    expect(installing.querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '70%' });

    first?.finish();
    await vi.waitFor(() => {
      expect(lib).toHaveTextContent('Done');
    });
    expect(within(lib).queryByRole('progressbar')).toBeNull();
    expect(lib.querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '100%' });
    // The next step has started, and says nothing yet of how far.
    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    expect(rowOf('Old')).toHaveTextContent('Running…');
    expect(rowOf('Old').querySelector('.emma-plan-bar')).toBeNull();
  });

  test('underlines a step Foundry says nothing of the progress of once done, and marks one that fails in red', async () => {
    const { held, rowOf } = await running();
    held[0]?.finish();
    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    expect(rowOf('Library').querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '100%' });

    held[1]?.tell({ phase: 'download', pct: 30 });
    held[1]?.fail();

    await vi.waitFor(() => {
      expect(rowOf('Old')).toHaveTextContent('Failed');
    });
    // Red, where it stopped.
    expect(rowOf('Old').querySelector('.emma-plan-bar-failed')).toHaveStyle({ width: '30%' });
  });
});

describe("a run's snapshot", () => {
  test('is underlined in green below its name once made, as Foundry says nothing of how far it has got', async () => {
    const { held, plan } = await running({ snapshot: true });
    const safeguards = within(within(plan).getByRole('table', { name: 'Keep first' }));
    const snapshot = safeguards.getByRole('rowheader', { name: /^Snapshot/ });
    expect(held[0]?.step.kind).toBe('snapshot');
    expect(snapshot.querySelector('.emma-plan-bar')).toBeNull();

    held[0]?.finish();

    await vi.waitFor(() => {
      expect(snapshot.querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '100%' });
    });
  });
});
