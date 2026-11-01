import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import { LAYOUT_KEY } from '../../../src/foundry/preferences';
import type { KitProblem } from '../../../src/foundry/setup-kit';
import { EXTENSION_RELEASES, KitUnavailable } from '../../../src/foundry/setup-kit';
import { buildOverview } from '../../../src/lib/overview';
import type { BlockedUpdate, PackageUpdate, UpdateSearch, VersionJudge } from '../../../src/lib/updates';
import { createPlanner } from '../../../src/lib/plans';
import {
  alone,
  installation,
  installedModule,
  noInstall,
  record,
  recorded,
  release,
  unjudged,
} from '../../mocks/fixtures';
import { KIT } from '../../mocks/kit';

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
 * A search that finds {@link UPDATES}, and some updates EMMA cannot offer.
 * @param blocks - The updates EMMA cannot offer
 * @returns The search
 */
const findingBlocked =
  (...blocks: BlockedUpdate[]): (() => Promise<UpdateSearch>) =>
  () =>
    Promise.resolve({
      updates: new Map(UPDATES.map(update => [update.key, update])),
      blocked: new Map(blocks.map(block => [block.key, block])),
      unresolved: [],
      judge,
      planner: alone(...UPDATES),
    });

/**
 * Badge D&D 5e 5.4.0 as unverified while the library is at 1.0.0, and verified once 2.0.0 is chosen; every other
 * version as verified.
 * @param key - The package
 * @param version - The version
 * @param chosen - The versions chosen
 * @returns The version, with its badge
 */
const judge: VersionJudge = (key, version, chosen) => {
  const type =
    key === 'system:dnd5e' && version === '5.4.0' && chosen('module:lib') !== '2.0.0' ? 'warning' : 'success';
  return { version, badge: { type, icon: 'fa-solid fa-code-branch', tooltip: `<b>${type}</b>`, text: type } };
};

/**
 * Render EMMA's window content, with the installation read and its updates searched for.
 * @param find - The search for updates; finding {@link UPDATES} by default
 * @returns The state and a user to act with
 */
async function setUp(find: () => Promise<UpdateSearch> = findingBlocked()) {
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
 * Open a version list, and wait for its versions to be worked out.
 * @param user - The user to act with
 * @param name - The name of the list's button
 * @returns Once the list shows its versions
 */
async function openList(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(screen.getByRole('button', { name }));
  await vi.waitFor(() => {
    const title = name.replace(/^Version of (.*): [^:]*$/, '$1');
    expect(screen.getByRole('listbox', { name: `Versions of ${title}` })).toHaveAttribute('aria-busy', 'false');
  });
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
    expect(screen.getByRole('button', { name: 'Version of D&D 5e: 5.3.3' })).toBeInTheDocument();
  });

  test('marks a package with a newer version EMMA cannot offer in red, and says why in its panel', async () => {
    const { user } = await setUp(
      findingBlocked(
        {
          key: 'system:dnd5e',
          newest: '6.0.6',
          holds: [
            { reason: 'inconsistent', world: { id: 'a', title: 'Alpha' } },
            { reason: 'unrecorded', world: { id: 'b', title: 'Beta' } },
          ],
          explanation: ['Because Old runs only in D&D 5e 5, Alpha cannot keep working. (1)'],
        },
        { key: 'module:lib', newest: '3.0.0', holds: [{ reason: 'unresolved', world: { id: 'a', title: 'Alpha' } }] },
      ),
    );

    // Beside the blue arrow of the update that is offered.
    const system = row(/D&D 5e 5\.3\.3/);
    expect(system).toHaveTextContent(/^Update available Newer version EMMA cannot offer D&D 5e/);
    expect(system.querySelector('.emma-tree-blocked .fa-circle-up')).not.toHaveClass('emma-tree-hidden');
    // Fainter on a collapsed row that hides one, and on none that does not.
    expect(row(/Universal/)).toHaveTextContent(/Newer versions EMMA cannot offer in the rows under it/);
    expect(row(/^Update available Newer version EMMA cannot offer D&D 5e/)).toBeInTheDocument();
    expect(row(/^Game systems/)).not.toHaveTextContent('cannot offer');

    await user.click(within(system).getByText('D&D 5e'));
    const panel = screen.getByRole('region', { name: 'Not offered: 6.0.6' });
    expect(panel).toHaveTextContent('EMMA cannot make every world that uses it consistent with this update. Why:');
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map(item => item.textContent.trim()),
    ).toEqual([
      'Because Old runs only in D&D 5e 5, Alpha cannot keep working. (1)',
      'In Alpha, the other packages it runs cannot all work with it.',
      'Beta has no EMMA record, so EMMA cannot tell whether the modules it runs would work with it.',
    ]);

    await user.click(within(row(/Universal/)).getByText('Universal'));
    await user.keyboard('{ArrowRight}');
    await user.click(within(row(/Library 1\.0\.0/)).getByText('Library'));
    expect(screen.getByRole('region', { name: 'Not offered: 3.0.0' })).toHaveTextContent(
      'EMMA found no working setup for Alpha, so nothing it uses is updated.',
    );
  });

  test('offers Foundry VTT itself on the root row, plans it, and says what holds a newer build back', async () => {
    const core: PackageUpdate = { key: 'core', installed: '14.368', newest: '14.369', versions: ['14.369', '14.368'] };
    const { user } = await setUp(() =>
      Promise.resolve({
        updates: new Map([['core', core]]),
        blocked: new Map([
          [
            'core',
            { key: 'core', newest: '14.370', holds: [{ reason: 'inconsistent', world: { id: 'a', title: 'Alpha' } }] },
          ],
          ['system:dnd5e', { key: 'system:dnd5e', newest: '6.0.6', holds: [], needsCore: '14.369' }],
        ]),
        unresolved: [],
        judge,
        planner: alone(core),
      }),
    );
    const root = row(/Foundry VTT 14\.368/);
    expect(root).toHaveTextContent(/^Update available Newer version EMMA cannot offer Foundry VTT/);
    expect(screen.getByRole('status')).toHaveTextContent('Updates available: 1');

    await openList(user, 'Version of Foundry VTT: 14.368');
    await user.click(screen.getByRole('option', { name: /^14\.369/ }));
    const plan = screen.getByRole('region', { name: 'Update plan' });
    expect(within(plan).getAllByRole('row')[1]).toHaveTextContent('Foundry VTT14.36814.369 Foundry VTT updates itself');

    await user.click(within(root).getByText('Foundry VTT'));
    const blocked = screen.getByRole('region', { name: 'Not offered: 14.370' });
    expect(blocked).toHaveTextContent('In Alpha, the other packages it runs cannot all work with it.');

    await user.click(within(row(/^Newer version EMMA cannot offer D&D 5e/)).getByText('D&D 5e'));
    expect(screen.getByRole('region', { name: 'Not offered: 6.0.6' })).toHaveTextContent(
      'It needs Foundry VTT 14.369 or later, which is not installed.',
    );
  });

  test('gives no column to red arrows while nothing is blocked', async () => {
    await setUp();

    expect(document.querySelector('.emma-tree-blocked')).toBeNull();
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

  test('offers the versions of each package with an update, each in its badge, and plans the ones chosen below the tree', async () => {
    const { user } = await setUp();
    expect(screen.queryByRole('region', { name: 'Update plan' })).toBeNull();

    const system = screen.getByRole('button', { name: 'Version of D&D 5e: 5.3.3' });
    expect(system).toHaveAttribute('aria-haspopup', 'listbox');
    expect(system.querySelector('.emma-badge.success')).toHaveTextContent('5.3.3');
    expect(system.querySelector('.emma-badge')).toHaveAttribute('data-tooltip-html', '<b>success</b>');
    expect(system).toHaveTextContent('Installed');

    await user.click(system);
    const list = screen.getByRole('listbox', { name: 'Versions of D&D 5e' });
    // The installed version, shown on the button, is left out.
    const options = within(list).getAllByRole('option');
    expect(options.map(option => option.textContent.trim().split(/\s+/)[0])).toEqual(['5.4.0']);
    expect(options[0]?.querySelector('.emma-badge')).toHaveClass('warning');
    // Opening the list selected its row, for its panel to explain the versions; choosing one keeps it so.
    const selected = screen.getByRole('treeitem', { selected: true });
    expect(selected).toHaveTextContent('D&D 5e');
    if (options[0] !== undefined) await user.click(options[0]);
    expect(screen.getByRole('treeitem', { selected: true })).toBe(selected);
    const chosen = screen.getByRole('button', { name: 'Version of D&D 5e: 5.4.0' });
    expect(chosen.querySelector('.emma-badge.warning')).toHaveTextContent('5.4.0');
    expect(chosen).not.toHaveTextContent('Installed');

    // Only a row that shows the installed version offers them: under a world, the version it last ran with shows.
    await user.click(within(row(/^Update available D&D 5e/)).getByText('D&D 5e'));
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(row(/^Alpha/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('treeitem', { name: /^Update available D&D 5e/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Version of/ })).toHaveLength(1);

    const plan = screen.getByRole('region', { name: 'Update plan' });
    expect(
      within(plan)
        .getAllByRole('row')
        .map(item => Array.from(item.querySelectorAll('th, td'), cell => cell.textContent.trim())),
    ).toEqual([
      ['Package', 'Installed', 'Chosen', 'Manifest URL'],
      ['D&D 5e', '5.3.3', '5.4.0', 'https://example.org/system:dnd5e/5.4.0/module.json'],
    ]);
    expect(screen.getByRole('separator', { name: 'Resize the update plan' })).toBeInTheDocument();

    await user.click(within(plan).getByRole('button', { name: 'Clear choices' }));
    expect(screen.queryByRole('region', { name: 'Update plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Version of D&D 5e: 5.3.3' })).toBeInTheDocument();
  });

  test('brings in what a version chosen needs, saying so, and offers only versions that work with it', async () => {
    const planner = createPlanner({
      resolver: KIT.resolver,
      overview: OVERVIEW,
      universe: {
        core: [{ version: '14.368', generation: 14, channel: 'stable' }],
        releases: [
          release('system:dnd5e', '5.3.3'),
          release('system:dnd5e', '5.4.0', { versionManifest: 'https://example.org/dnd5e/5.4.0/system.json' }),
          release('module:lib', '1.0.0', { systems: { dnd5e: { maximum: '5.3.9' } } }),
          release('module:lib', '1.5.0', { systems: { dnd5e: { maximum: '5.3.9' } } }),
          release('module:lib', '2.0.0', { systems: { dnd5e: { minimum: '5.4.0' } } }),
        ],
      },
      load: () => Promise.resolve([]),
      policy: { verified: 'ignore', systemCompatibility: 'require', missingCompatibility: 'reject' },
      coreTitle: 'Foundry VTT',
    });
    const { user } = await setUp(() =>
      Promise.resolve({
        updates: new Map(UPDATES.map(update => [update.key, update])),
        blocked: new Map(),
        unresolved: [],
        judge,
        planner,
      }),
    );

    await openList(user, 'Version of D&D 5e: 5.3.3');
    const looked = screen.getByRole('region', { name: '5.4.0 update' });
    expect(looked).toHaveTextContent('It needs: D&D 5e 5.4.0 depends on Foundry VTT 14 or later');
    expect(looked).toHaveTextContent('Choosing it also changes: Library to 2.0.0');
    await user.click(screen.getByRole('option', { name: /^5\.4\.0/ }));
    await vi.waitFor(() => {
      expect(screen.getByRole('region', { name: 'Update plan' })).toBeInTheDocument();
    });
    const plan = screen.getByRole('region', { name: 'Update plan' });
    expect(
      within(plan)
        .getAllByRole('row')
        .slice(1)
        .map(item => Array.from(item.querySelectorAll('th, td'), cell => cell.textContent.replace(/\s+/g, ' ').trim())),
    ).toEqual([
      ['D&D 5e', '5.3.3', '5.4.0', 'https://example.org/dnd5e/5.4.0/system.json'],
      ['Library', '1.0.0', '2.0.0 needed by D&D 5e 5.4.0', 'None found for this version'],
    ]);

    // The library's versions for D&D 5e 5.3 no longer work with what is chosen: listed, locked, saying what is in the way.
    await user.click(within(row(/Universal/)).getByText('Universal'));
    await user.keyboard('{ArrowRight}');
    await openList(user, 'Version of Library: 2.0.0');
    const list = screen.getByRole('listbox', { name: 'Versions of Library' });
    const locked = within(list).getAllByRole('option');
    expect(locked.map(item => item.textContent.trim().split(/\s+/)[0])).toEqual(['1.5.0', '1.0.0']);
    for (const item of locked) expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(locked[0]).toHaveTextContent('Not with what is chosen');
    const why = screen.getByRole('region', { name: '1.5.0 update' });
    expect(why).toHaveTextContent('The plan cannot take it as it is: to choose it, take D&D 5e 5.4.0 out of the plan.');
    expect(why).toHaveTextContent('Why:');
    // Choosing it is refused, and the list stays open on it.
    await user.keyboard('{Enter}');
    expect(list.closest('[popover]')).toHaveAttribute('data-popover-open');
    expect(screen.getByRole('button', { name: 'Version of Library: 2.0.0' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // Taking the choice back takes what it needed back too.
    await openList(user, 'Version of D&D 5e: 5.4.0');
    await user.click(screen.getByRole('option', { name: /^5\.3\.3/ }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Update plan' })).toBeNull();
    });
  });

  test('explains in the panel the version looked at in a list, and then the one chosen', async () => {
    const { user } = await setUp();
    expect(screen.queryByRole('region', { name: /update$/ })).toBeNull();

    // Opening the list shows its row's panel, explaining the version the keyboard is on.
    await openList(user, 'Version of D&D 5e: 5.3.3');
    expect(screen.getByRole('heading', { level: 2, name: 'D&D 5e' })).toBeInTheDocument();
    const looked = screen.getByRole('region', { name: '5.4.0 update' });
    expect(looked.querySelector('.emma-badge.warning')).toHaveTextContent('5.4.0');
    expect(within(looked).getByRole('listitem')).toHaveTextContent('warning');

    // Closing it without a choice leaves nothing to explain.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: '5.4.0 update' })).toBeNull();

    await openList(user, 'Version of D&D 5e: 5.3.3');
    await user.click(screen.getByRole('option', { name: /^5\.4\.0/ }));
    expect(screen.getByRole('region', { name: '5.4.0 update' })).toBeInTheDocument();

    // Looking at the installed one, now in the list, explains it as installed while the list is open.
    await openList(user, 'Version of D&D 5e: 5.4.0');
    expect(screen.getByRole('region', { name: '5.3.3, installed' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('region', { name: '5.4.0 update' })).toBeInTheDocument();
  });

  test('explains a version each recorded world judges, world by world, and one with no verdict', async () => {
    const { user } = await setUp(() =>
      Promise.resolve({
        updates: new Map(UPDATES.map(update => [update.key, update])),
        blocked: new Map(),
        unresolved: [],
        planner: alone(...UPDATES),
        judge: (key, version) =>
          key === 'system:dnd5e' && version === '5.4.0'
            ? {
                version,
                badge: { type: 'error', icon: '', tooltip: 'Breaks <b>Old</b>', text: 'Breaks Old' },
                worlds: [
                  { title: 'Alpha', badge: { type: 'success', icon: '', tooltip: 'Fine', text: 'Fine' } },
                  {
                    title: 'Beta',
                    badge: { type: 'error', icon: '', tooltip: 'Breaks <b>Old</b><br>Truly', text: '' },
                  },
                ],
              }
            : { version, badge: null },
      }),
    );
    await openList(user, 'Version of D&D 5e: 5.3.3');

    const looked = screen.getByRole('region', { name: '5.4.0 update' });
    expect(looked.querySelector('p .emma-badge')).toHaveClass('error');
    expect(Array.from(looked.querySelectorAll('strong'), title => title.textContent)).toEqual(['Alpha', 'Beta']);
    expect(Array.from(looked.querySelectorAll('li .emma-badge'), badge => badge.classList.contains('error'))).toEqual([
      false,
      true,
    ]);
    expect(Array.from(looked.querySelectorAll('.emma-explanation-lines li'), line => line.textContent)).toEqual([
      'Fine',
      'Breaks Old',
      'Truly',
    ]);

    await user.keyboard('{Escape}');
    await openList(user, 'Version of D&D 5e: 5.3.3');
    await user.keyboard('{ArrowDown}');
    // The installed version is shown on the button, so the list holds 5.4.0 alone; the keyboard stays on it.
    await user.keyboard('{Escape}');
    await user.click(within(row(/Universal/)).getByText('Universal'));
    await user.keyboard('{ArrowRight}');
    await openList(user, 'Version of Library: 1.0.0');
    expect(screen.getByRole('region', { name: '2.0.0 update' })).toHaveTextContent(
      'EMMA has no verdict on this version',
    );
  });

  test('badges each version with the other packages at the versions chosen', async () => {
    const { user } = await setUp();
    await user.click(within(row(/Universal/)).getByText('Universal'));
    await user.keyboard('{ArrowRight}');

    await openList(user, 'Version of Library: 1.0.0');
    await user.click(screen.getByRole('option', { name: /^2\.0\.0/ }));
    await openList(user, 'Version of D&D 5e: 5.3.3');

    const list = screen.getByRole('listbox', { name: 'Versions of D&D 5e' });
    expect(within(list).getByRole('option').querySelector('.emma-badge')).toHaveClass('success');
  });

  test("leaves the tree's keys to the version list while it has the keyboard", async () => {
    const { user } = await setUp();
    await openList(user, 'Version of D&D 5e: 5.3.3');
    const list = screen.getByRole('listbox', { name: 'Versions of D&D 5e' });
    expect(list).toHaveFocus();

    await user.keyboard('{End}');
    expect(list).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Version of D&D 5e: 5.3.3' })).toHaveFocus();
  });

  test.each([
    [
      'finds none',
      () =>
        Promise.resolve({ updates: new Map(), blocked: new Map(), unresolved: [], judge: unjudged, planner: alone() }),
      'No updates found',
    ],
    ['fails', () => Promise.reject(new Error('offline')), 'Could not look for updates'],
    [
      'finds no setup for a world',
      () =>
        Promise.resolve({
          updates: new Map(),
          blocked: new Map(),
          unresolved: ['a'],
          judge: unjudged,
          planner: alone(),
        }),
      'EMMA found no working setup for 1 recorded worlds',
    ],
  ] as const)('says so when the search %s, and offers no versions', async (_label, find, text) => {
    await setUp(find);

    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.queryByRole('button', { name: /^Version of/ })).toBeNull();
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
    expect(screen.queryByRole('button', { name: /^Version of/ })).toBeNull();
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

    await openList(user, 'Version of D&D 5e: 5.3.3');
    await user.click(screen.getByRole('option', { name: /^5\.4\.0/ }));
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
