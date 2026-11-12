import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { Planner } from '../../../src/lib/plans';
import type { RunStep, StepProgress } from '../../../src/lib/run';
import type { PackageUpdate } from '../../../src/lib/updates';
import { alone, installation, installedModule, noInstall, unjudged } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({ modules: [installedModule('lib', 'Library', '1.0.0'), installedModule('old', 'Old', '1.0.0')] }),
  new Map(),
);
const LIB: PackageUpdate = { key: 'module:lib', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };
const OLD: PackageUpdate = { key: 'module:old', installed: '1.0.0', newest: '1.1.0', versions: ['1.1.0', '1.0.0'] };

/**
 * A planner whose plans have Old wait for the Library, if asked to, as one whose version requires it would.
 * @param planner - The planner
 * @param oldNeedsLib - Whether Old waits for the Library
 * @returns The planner
 */
function waiting(planner: Planner, oldNeedsLib: boolean): Planner {
  if (!oldNeedsLib) return planner;
  return {
    ...planner,
    plan: async picks =>
      (await planner.plan(picks))?.map(entry =>
        entry.key === 'module:old' ? { ...entry, after: ['module:lib'] } : entry,
      ),
  };
}

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
 * @param options.oldNeedsLib - Whether Old's version requires the Library's, so waits for it
 * @param options.beforePlan - Called with the plan's region just before **Run plan** is chosen
 * @param options.beforeRun - Called with the plan's region just before the run is confirmed
 * @returns The steps as they start, and the plan's region
 */
async function running({
  snapshot = false,
  oldNeedsLib = false,
  beforePlan,
  beforeRun,
}: {
  snapshot?: boolean;
  oldNeedsLib?: boolean;
  beforePlan?: (plan: HTMLElement) => Promise<void> | void;
  beforeRun?: (plan: HTMLElement) => Promise<void> | void;
} = {}) {
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
        planner: waiting(alone(LIB, OLD), oldNeedsLib),
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
  await beforePlan?.(plan);
  await user.click(within(plan).getByRole('button', { name: 'Run plan' }));
  await beforeRun?.(plan);
  await user.click(within(plan).getByRole('button', { name: 'Run' }));
  // The snapshot first, alone; or else both installs at once, as neither needs the other.
  await vi.waitFor(() => {
    expect(held).toHaveLength(snapshot || oldNeedsLib ? 1 : 2);
  });
  const changes = within(within(plan).getByRole('table', { name: 'Changes' }));
  const rowOf = (name: string) => changes.getByRole('rowheader', { name: new RegExp(`^${name}`) });
  return { held, plan, rowOf };
}

describe("a plan's run, step by step", () => {
  test('shows the run order at the top of a plan scrolled to its end, as Run plan asks to confirm it', async () => {
    const shown = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    await running({
      beforePlan: region => {
        region.scrollTop = 500;
      },
      beforeRun: async region => {
        await vi.waitFor(() => {
          expect(region.scrollTop).toBe(0);
        });
        expect(within(region).getByRole('alertdialog')).toBeInTheDocument();
        expect(shown.mock.contexts).toContain(region.querySelector('header'));
      },
    });
  });

  test('brings its steps into view as it starts, the plan having been scrolled down to its Run button', async () => {
    const shown = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const { plan } = await running({
      beforeRun: region => {
        region.scrollTop = 300;
      },
    });

    await vi.waitFor(() => {
      expect(plan.scrollTop).toBe(0);
    });
    const header = plan.querySelector('header');
    expect(shown.mock.contexts).toContain(header);
    expect(shown).toHaveBeenCalledWith({ block: 'nearest' });
  });

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
    expect(downloading.querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '0%' });
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
    // The install's green bar runs on to the end and stays, as the underline: the same bar, not one put in its place.
    expect(lib.querySelector('.emma-plan-bar')).toBe(installing);
    expect(installing.querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '100%' });
    expect(installing).toHaveAttribute('aria-hidden', 'true');
    // Old has run beside it all along, and says nothing yet of how far.
    expect(held.map(({ step }) => step.key)).toEqual(['module:lib', 'module:old']);
    expect(rowOf('Old')).toHaveTextContent('Running…');
    expect(rowOf('Old').querySelector('.emma-plan-bar')).toBeNull();
  });

  test('underlines a step Foundry says nothing of the progress of once done, and marks one that fails in red', async () => {
    const { held, rowOf } = await running();
    held[0]?.finish();
    await vi.waitFor(() => {
      expect(rowOf('Library').querySelector('.emma-plan-bar-install')).toHaveStyle({ width: '100%' });
    });

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
    // The installs wait for the snapshot, then start together.
    await vi.waitFor(() => {
      expect(held).toHaveLength(3);
    });
  });
});

describe('a step that needs one that failed', () => {
  test('is not run, saying what it needed, while the footer counts what failed and what was not run', async () => {
    const { held, rowOf } = await running({ oldNeedsLib: true });
    expect(held.map(({ step }) => step.key)).toEqual(['module:lib']);
    expect(rowOf('Old')).toHaveTextContent('Waiting');

    held[0]?.fail();

    await vi.waitFor(() => {
      expect(rowOf('Old')).toHaveTextContent('Not run');
    });
    expect(rowOf('Old')).toHaveTextContent('It needs install Library 2.0.0, which failed or was not run.');
    expect(rowOf('Old').querySelector('.fa-ban')).not.toBeNull();
    expect(rowOf('Old').querySelector('.emma-plan-bar')).toBeNull();
    expect(held).toHaveLength(1);
    await vi.waitFor(() => {
      expect(screen.getByText(/“install Library 2\.0\.0” failed/)).toHaveTextContent(
        '“install Library 2.0.0” failed: The server refused it Steps not run, as steps they need failed: 1.',
      );
    });
  });
});
