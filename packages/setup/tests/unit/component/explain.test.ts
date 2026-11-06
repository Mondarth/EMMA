import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { Planner } from '../../../src/lib/plans';
import type { RunStep } from '../../../src/lib/run';
import type { PackageUpdate } from '../../../src/lib/updates';
import { alone, installation, installedModule, noInstall, unjudged } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(installation({ modules: [installedModule('lib', 'Library', '1.0.0')] }), new Map());
const LIB: PackageUpdate = { key: 'module:lib', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };

/**
 * A planner that knows newer Libraries than it offers, each refused for a reason, as their versions say.
 * @returns The planner
 */
const planner = (): Planner => ({
  ...alone(LIB),
  newerThan: (_key, version) =>
    version === '2.0.0' ? ['3.4.0', '3.3.0', '3.2.0', '3.1.0', '3.0.5', '3.0.0', '2.5.0'] : [],
  whyNotTaken: (_key, version) => {
    switch (version) {
      case '3.4.0':
        return Promise.resolve({ reason: 'no-manifest' as const });
      case '3.3.0':
        return Promise.resolve({ reason: 'no-build' as const, minimum: '15' });
      case '3.2.0':
        return Promise.resolve({ reason: 'no-build' as const });
      case '3.1.0':
      case '3.0.5':
        return Promise.resolve({ reason: 'conflict' as const, explanation: [`Library ${version} needs Helper.`] });
      case '3.0.0':
        return Promise.resolve({ reason: 'conflict' as const, explanation: [] });
      default:
        return Promise.resolve(undefined);
    }
  },
});

/**
 * Render EMMA's window with Library chosen at 2.0.0, its runs failing as Foundry would.
 * @returns The state, the plan, and a user to act with
 */
async function planned() {
  const runStep = vi.fn((_step: Exclude<RunStep, { kind: 'core' }>) =>
    Promise.reject(new Error('No version 2.0.0 found in the manifest')),
  );
  const setup = new SetupState({
    load: () => Promise.resolve(OVERVIEW),
    guardOn: true,
    onGuardChange: vi.fn(),
    findUpdates: () =>
      Promise.resolve({
        updates: new Map([[LIB.key, LIB]]),
        blocked: new Map(),
        unresolved: [],
        judge: unjudged,
        planner: planner(),
      }),
    installModule: noInstall,
    runStep,
  });
  await setup.refresh();
  await vi.waitFor(() => {
    expect(setup.updates.status).toBe('found');
  });
  await setup.updates.choose('module:lib', '2.0.0');
  render(SetupRoot, { setup });
  const plan = await screen.findByRole('region', { name: 'Update plan' });
  return { setup, plan, user: userEvent.setup() };
}

describe('why the plan takes the version it does', () => {
  test("opens a package's row from its line in the plan, whose panel says why not a newer version", async () => {
    const { plan, user } = await planned();

    await user.click(within(plan).getByRole('button', { name: 'Show Library in the tree' }));

    expect(screen.getByRole('treeitem', { selected: true })).toHaveTextContent('Library');
    const why = await screen.findByRole('region', { name: 'Why 2.0.0, not 3.4.0' });
    expect(
      within(why)
        .getAllByRole('listitem')
        .map(item => item.textContent.trim()),
    ).toEqual([
      '3.4.0: no manifest URL for that version alone, which installing it needs.',
      '3.3.0: needs Foundry VTT 15 or later.',
      '3.2.0: runs on no build of Foundry VTT the plan may choose.',
      // Folded, as each names itself alike: the explanation names them all.
      expect.stringMatching(
        /^3\.1\.0 – 3\.0\.5: the plan cannot take it with the other versions chosen:\s*Library 3\.1\.0 – 3\.0\.5 needs Helper\.$/,
      ),
      'Library 3.1.0 – 3.0.5 needs Helper.',
      '3.0.0: the plan cannot take it with the other versions chosen:',
      '2.5.0: the plan could take it now.',
    ]);
  });
});

describe('a step that failed', () => {
  test('says why in its panel, and points there from the plan and the footer', async () => {
    const { setup, plan, user } = await planned();
    await user.click(within(plan).getByRole('button', { name: 'Run plan' }));
    await user.click(within(plan).getByRole('button', { name: 'Run' }));
    await vi.waitFor(() => {
      expect(setup.run?.over).toBe(true);
    });
    expect(setup.run?.failures).toEqual({ 'module:lib': 'No version 2.0.0 found in the manifest' });

    await vi.waitFor(() => {
      expect(within(plan).getByRole('rowheader', { name: /Library/ })).toHaveTextContent(
        'Failed Select it to see why.',
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Select a failed step in the plan to see why.');

    await user.click(within(plan).getByRole('button', { name: 'Show Library in the tree' }));

    const failed = screen.getByRole('alert');
    expect(failed).toHaveTextContent('Installing Library 2.0.0 failed');
    expect(failed).toHaveTextContent('EMMA asked Foundry to install 2.0.0 from:');
    expect(within(failed).getByRole('link')).toHaveAttribute(
      'href',
      'https://example.org/module:lib/2.0.0/module.json',
    );
    expect(failed).toHaveTextContent('Foundry answered: No version 2.0.0 found in the manifest');
    expect(failed).toHaveTextContent('A manifest URL can give a version other than the one it is listed for');
  });
});

describe("a game system's update", () => {
  test('says why not a newer version, and why it failed, in its panel too', async () => {
    const SYSTEM: PackageUpdate = {
      key: 'system:dnd5e',
      installed: '5.3.3',
      newest: '5.4.0',
      versions: ['5.4.0', '5.3.3'],
    };
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: () =>
        Promise.resolve({
          updates: new Map([[SYSTEM.key, SYSTEM]]),
          blocked: new Map(),
          unresolved: [],
          judge: unjudged,
          planner: {
            ...alone(SYSTEM),
            newerThan: () => ['6.0.0'],
            whyNotTaken: () => Promise.resolve({ reason: 'no-build' as const, minimum: '15' }),
          },
        }),
      installModule: noInstall,
      runStep: () => Promise.reject(new Error('The server refused it')),
    });
    await setup.refresh();
    await vi.waitFor(() => {
      expect(setup.updates.status).toBe('found');
    });
    await setup.updates.choose('system:dnd5e', '5.4.0');
    render(SetupRoot, { setup });
    const user = userEvent.setup();
    const plan = await screen.findByRole('region', { name: 'Update plan' });
    await user.click(within(plan).getByRole('button', { name: 'Run plan' }));
    await user.click(within(plan).getByRole('button', { name: 'Run' }));
    await vi.waitFor(() => {
      expect(setup.run?.over).toBe(true);
    });

    await user.click(within(plan).getByRole('button', { name: /^Show .* in the tree$/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Foundry answered: The server refused it');
    expect(await screen.findByRole('region', { name: 'Why 5.4.0, not 6.0.0' })).toHaveTextContent(
      '6.0.0: needs Foundry VTT 15 or later.',
    );
  });
});

describe("Foundry VTT's line in the plan", () => {
  test('opens the root of the tree', async () => {
    const CORE: PackageUpdate = { key: 'core', installed: '14.368', newest: '14.369', versions: ['14.369', '14.368'] };
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: () =>
        Promise.resolve({
          updates: new Map([[CORE.key, CORE]]),
          blocked: new Map(),
          unresolved: [],
          judge: unjudged,
          planner: alone(CORE),
        }),
      installModule: noInstall,
    });
    await setup.refresh();
    await vi.waitFor(() => {
      expect(setup.updates.status).toBe('found');
    });
    await setup.updates.choose('core', '14.369');
    render(SetupRoot, { setup });
    const user = userEvent.setup();
    const plan = await screen.findByRole('region', { name: 'Update plan' });
    await user.click(within(screen.getAllByRole('treeitem')[1] as HTMLElement).getByText(/./, { selector: 'span' }));

    await user.click(within(plan).getByRole('button', { name: /^Show .* in the tree$/ }));

    expect(screen.getByRole('treeitem', { selected: true })).toBe(screen.getAllByRole('treeitem')[0]);
  });
});
