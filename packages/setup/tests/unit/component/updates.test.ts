import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import { LAYOUT_KEY } from '../../../src/foundry/preferences';
import type { KitProblem } from '../../../src/foundry/setup-kit';
import { EXTENSION_RELEASES, KitUnavailable } from '../../../src/foundry/setup-kit';
import { buildOverview } from '../../../src/lib/overview';
import type { PackageUpdate, UpdateSearch } from '../../../src/lib/updates';
import { installation, installedModule, noInstall, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }],
    modules: [installedModule('lib', 'Library', '1.0.0')],
  }),
  new Map([['a', recorded(record('a', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))]]),
);

const UPDATES: readonly PackageUpdate[] = [
  { key: 'system:dnd5e', installed: '5.3.3', newest: '5.4.0', versions: ['5.4.0', '5.3.3'] },
  { key: 'module:lib', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.5.0', '1.0.0'] },
];

/**
 * Render EMMA's window content, with the installation read and its updates searched for.
 * @param find - The search for updates; finding {@link UPDATES} by default
 * @returns The state and a user to act with
 */
async function setUp(
  find: () => Promise<UpdateSearch> = () =>
    Promise.resolve({ updates: new Map(UPDATES.map(update => [update.key, update])), unresolved: [] }),
) {
  const setup = new SetupState({
    load: () => Promise.resolve(OVERVIEW),
    guardOn: true,
    onGuardChange: vi.fn(),
    findUpdates: find,
    installModule: noInstall,
  });
  await setup.refresh();
  render(SetupRoot, { setup });
  // The search runs after the installation is read.
  await vi.waitFor(() => {
    expect(setup.updates.status).not.toBe('searching');
  });
  return { setup, user: userEvent.setup() };
}

/**
 * A row of the tree, by its name.
 * @param name - The name
 * @returns The row
 */
const row = (name: RegExp) => screen.getByRole('treeitem', { name });

afterEach(() => {
  localStorage.clear();
});

describe('updates in the window', () => {
  test('marks each package with an update, and says how many there are', async () => {
    await setUp();

    expect(screen.getByRole('status')).toHaveTextContent('Updates available: 2');
    expect(row(/^Update available D&D 5e 5\.3\.3/)).toBeInTheDocument();
    expect(row(/^Foundry VTT/)).not.toHaveTextContent('Update available');
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  test('marks a collapsed row that hides an update, until it is expanded', async () => {
    const { user } = await setUp();
    const universal = row(/Universal/);
    expect(universal).toHaveTextContent(/^Updates in the rows under it/);
    expect(row(/^Game systems/)).not.toHaveTextContent('Updates in the rows under it');

    await user.click(within(universal).getByText('Universal'));
    await user.keyboard('{ArrowRight}');

    expect(universal).toHaveAttribute('aria-expanded', 'true');
    expect(universal).not.toHaveTextContent('Updates in the rows under it');
    expect(row(/^Update available Library/)).toBeInTheDocument();

    await user.click(within(row(/^Foundry VTT/)).getByText(/Foundry VTT/));
    await user.keyboard('{ArrowLeft}');
    expect(row(/Foundry VTT/)).toHaveTextContent(/^Updates in the rows under it/);
  });

  test('offers the versions in Update mode, and plans the ones chosen below the tree and the panel', async () => {
    const { user } = await setUp();
    expect(screen.queryByRole('combobox')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByRole('button', { name: 'Update' })).toHaveAttribute('aria-pressed', 'true');
    const system = screen.getByRole('combobox', { name: 'Version of D&D 5e' });
    expect(
      within(system)
        .getAllByRole('option')
        .map(option => option.textContent.trim()),
    ).toEqual(['5.4.0', '5.3.3 (installed)']);
    // Only a row that shows the installed version offers them: under a world, the version it last ran with shows.
    await user.click(within(row(/^Update available D&D 5e/)).getByText('D&D 5e'));
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(row(/^Alpha/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('treeitem', { name: /^Update available D&D 5e/ })).toHaveLength(2);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Update plan' })).toBeNull();

    await user.selectOptions(system, '5.4.0');
    const plan = screen.getByRole('region', { name: 'Update plan' });
    expect(
      within(plan)
        .getAllByRole('row')
        .map(item => Array.from(item.querySelectorAll('th, td'), cell => cell.textContent.trim())),
    ).toEqual([
      ['Package', 'Installed', 'Chosen'],
      ['D&D 5e', '5.3.3', '5.4.0'],
    ]);
    expect(screen.getByRole('separator', { name: 'Resize the update plan' })).toBeInTheDocument();

    await user.click(within(plan).getByRole('button', { name: 'Clear choices' }));
    expect(screen.queryByRole('region', { name: 'Update plan' })).toBeNull();
    expect(system).toHaveValue('5.3.3');

    await user.selectOptions(system, '5.4.0');
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Update plan' })).toBeNull();
  });

  test("leaves the tree's keys to the version list while it has the keyboard", async () => {
    const { user } = await setUp();
    await user.click(screen.getByRole('button', { name: 'Update' }));
    const system = screen.getByRole('combobox', { name: 'Version of D&D 5e' });

    system.focus();
    await user.keyboard('{End}');

    expect(system).toHaveFocus();
  });

  test.each([
    ['finds none', () => Promise.resolve({ updates: new Map(), unresolved: [] }), 'No updates found'],
    ['fails', () => Promise.reject(new Error('offline')), 'Could not look for updates'],
    [
      'finds no setup for a world',
      () => Promise.resolve({ updates: new Map(), unresolved: ['a'] }),
      'EMMA found no working setup for 1 recorded worlds',
    ],
  ] as const)('says so when the search %s, and offers no Update mode', async (_label, find, text) => {
    await setUp(find);

    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
  });

  test('says it is looking while the search goes on', async () => {
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: () => new Promise(() => undefined),
      installModule: noInstall,
    });
    await setup.refresh();
    render(SetupRoot, { setup });

    expect(screen.getByRole('status')).toHaveTextContent('Looking for updates…');
  });
});

describe('without an EMMA module whose setup kit fits', () => {
  /**
   * Render EMMA's window content, with the search for updates unable to be made.
   * @param problem - Why
   * @param installModule - The install of the EMMA module
   * @returns The state and a user to act with
   */
  async function unavailable(problem: KitProblem, installModule: () => Promise<void> = noInstall) {
    const setup = new SetupState({
      load: () => Promise.resolve(OVERVIEW),
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: () => Promise.reject(new KitUnavailable(problem)),
      installModule,
    });
    await setup.refresh();
    render(SetupRoot, { setup });
    await vi.waitFor(() => {
      expect(setup.updates.status).toBe('unavailable');
    });
    return { setup, user: userEvent.setup() };
  }

  test('offers to install the module, which it does, and then searches again', async () => {
    let finish = (): void => undefined;
    const installModule = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const { user } = await unavailable({ reason: 'missing' }, installModule);
    expect(screen.getByRole('status')).toHaveTextContent('Finding updates needs the EMMA module installed.');
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    // The tree works without it.
    expect(screen.getByRole('tree')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Install the EMMA module' }));

    expect(installModule).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Installing the EMMA module…');
    expect(screen.getByRole('button', { name: 'Install the EMMA module' })).toBeDisabled();
    finish();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Install the EMMA module' })).toBeEnabled();
    });
  });

  test('offers to update a module too old', async () => {
    const installModule = vi.fn(noInstall);
    const { user } = await unavailable({ reason: 'module-too-old', version: '0.9.0' }, installModule);

    expect(screen.getByRole('status')).toHaveTextContent('Finding updates needs a newer EMMA module than 0.9.0.');
    await user.click(screen.getByRole('button', { name: 'Update the EMMA module' }));
    expect(installModule).toHaveBeenCalledOnce();
  });

  test('points to the newest browser extension when the module is newer than it', async () => {
    await unavailable({ reason: 'extension-too-old', version: '2.0.0' });

    expect(screen.getByRole('status')).toHaveTextContent(
      'EMMA module 2.0.0 needs a newer browser extension to find updates.',
    );
    expect(screen.getByRole('link', { name: 'Get the newest browser extension' })).toHaveAttribute(
      'href',
      EXTENSION_RELEASES,
    );
    expect(screen.queryByRole('button', { name: /EMMA module/ })).not.toBeInTheDocument();
  });
});

describe("the panels' sizes", () => {
  test('change from the keyboard, within their limits, and are kept', async () => {
    const { user } = await setUp();
    const tree = screen.getByRole('separator', { name: 'Resize the installation tree' });
    expect(tree).toHaveAttribute('aria-valuenow', '40');

    tree.focus();
    await user.keyboard('{ArrowRight}');
    expect(tree).toHaveAttribute('aria-valuenow', '42');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(tree).toHaveAttribute('aria-valuenow', '38');
    await user.keyboard('{End}');
    expect(tree).toHaveAttribute('aria-valuenow', '85');
    await user.keyboard('{Home}{a}');
    expect(tree).toHaveAttribute('aria-valuenow', '15');
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}')).toMatchObject({ tree: 0.15 });

    await user.click(screen.getByRole('button', { name: 'Update' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Version of D&D 5e' }), '5.4.0');
    const plan = screen.getByRole('separator', { name: 'Resize the update plan' });
    plan.focus();
    // The plan is below its handle, so moving the handle up grows it.
    await user.keyboard('{ArrowUp}');
    expect(plan).toHaveAttribute('aria-valuenow', '37');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(plan).toHaveAttribute('aria-valuenow', '33');
  });

  test('follow the pointer while it drags a handle', async () => {
    await setUp();
    const tree = screen.getByRole('separator', { name: 'Resize the installation tree' });
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 100, y: 0, width: 1000, height: 500 }));

    // Moving without dragging does nothing.
    await fireEvent.pointerMove(tree, { clientX: 600, pointerId: 1 });
    expect(tree).toHaveAttribute('aria-valuenow', '40');

    await fireEvent.pointerDown(tree, { clientX: 500, pointerId: 1 });
    await fireEvent.pointerMove(tree, { clientX: 600, pointerId: 1 });
    expect(tree).toHaveAttribute('aria-valuenow', '50');
    await fireEvent.pointerMove(tree, { clientX: 1100, pointerId: 1 });
    expect(tree).toHaveAttribute('aria-valuenow', '85');

    // Nothing to measure against, as while the window is hidden.
    rect.mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 }));
    await fireEvent.pointerMove(tree, { clientX: 300, pointerId: 1 });
    expect(tree).toHaveAttribute('aria-valuenow', '85');

    await fireEvent.pointerUp(tree, { pointerId: 1 });
    rect.mockReturnValue(DOMRect.fromRect({ x: 100, y: 0, width: 1000, height: 500 }));
    await fireEvent.pointerMove(tree, { clientX: 300, pointerId: 1 });
    expect(tree).toHaveAttribute('aria-valuenow', '85');

    await fireEvent.pointerDown(tree, { clientX: 500, pointerId: 1 });
    await fireEvent.pointerCancel(tree, { pointerId: 1 });
    await fireEvent.pointerMove(tree, { clientX: 300, pointerId: 1 });
    expect(tree).toHaveAttribute('aria-valuenow', '85');
  });
});
