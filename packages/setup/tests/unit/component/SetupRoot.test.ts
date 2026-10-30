import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'a', title: 'Alpha', system: 'dnd5e' },
      { id: 'b', title: 'Beta', system: 'pf2e' },
      { id: 'c', title: 'Gamma', system: 'dnd5e' },
      { id: 'd', title: 'Delta', system: 'dnd5e' },
    ],
    modules: [
      installedModule('lib', 'Library', '1.1.0'),
      installedModule('idle', 'Idle', '1.0.0', { systems: ['dnd5e'], requires: ['lib'] }),
    ],
  }),
  new Map<string, RecordState>([
    [
      'a',
      recorded(
        record('a', {
          core: '14.360',
          modules: [
            { id: 'lib', title: 'Library', version: '1.0.0' },
            { id: 'gone', title: 'Gone', version: '2.0.0' },
          ],
        }),
      ),
    ],
    ['c', { kind: 'unreadable' }],
    ['d', recorded(record('d', { modules: [{ id: 'lib', title: 'Library', version: '1.1.0' }] }))],
  ]),
);

/**
 * Render EMMA's window content, with the installation read.
 * @param options - What else differs
 * @param options.guardOn - Whether the guard starts on
 * @returns The state and a user to act with
 */
async function setUp({ guardOn = true } = {}) {
  const onGuardChange = vi.fn();
  const setup = new SetupState({ load: () => Promise.resolve(OVERVIEW), guardOn, onGuardChange });
  await setup.refresh();
  render(SetupRoot, { setup });
  return { setup, onGuardChange, user: userEvent.setup() };
}

/**
 * A row of the tree, the first if several have the name.
 * @param name - Its name
 * @returns The row
 */
const row = (name: RegExp) => screen.getAllByRole('treeitem', { name })[0] as HTMLElement;

/**
 * Expand or collapse a row from its triangle.
 * @param user - The user
 * @param name - The row's name
 */
async function toggle(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  const triangle = row(name).querySelector('.emma-tree-toggle');
  if (triangle === null) throw new Error(`No triangle on ${String(name)}`);
  await user.click(triangle);
}

/**
 * The items of a list in a region.
 * @param name - The region's name
 * @returns Their text
 */
const items = (name: string) =>
  within(screen.getByRole('region', { name }))
    .getAllByRole('listitem')
    .map(item => item.textContent.replace(/\s+/g, ' ').trim());

describe('SetupRoot', () => {
  test('says it is reading the installation, or that it could not', async () => {
    const setup = new SetupState({
      load: () => Promise.reject(new Error('offline')),
      guardOn: true,
      onGuardChange: vi.fn(),
    });
    render(SetupRoot, { setup });
    expect(screen.getByRole('status')).toHaveTextContent("Reading the worlds' records…");

    await setup.refresh();

    expect(await screen.findByRole('status')).toHaveTextContent('EMMA could not read the installation.');
  });

  test('reads the installation again', async () => {
    const { setup, user } = await setUp();
    const refresh = vi.spyOn(setup, 'refresh');

    await user.click(screen.getByRole('button', { name: 'Read again' }));

    expect(refresh).toHaveBeenCalledOnce();
  });

  test('shows the root at first: the Foundry version and a summary', async () => {
    await setUp();

    expect(screen.getByRole('treeitem', { name: /Foundry VTT 14\.368/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Foundry VTT 14.368' })).toBeInTheDocument();
    const worlds = screen.getByRole('region', { name: 'Worlds' });
    expect(within(worlds).getByText('Changed since it last ran').nextElementSibling).toHaveTextContent('1');
    expect(within(worlds).getByText('No record').nextElementSibling).toHaveTextContent('1');
    expect(within(worlds).getByText('D&D 5e: 3')).toBeInTheDocument();
    expect(within(worlds).getByText(/has not been opened with EMMA 0\.9/)).toBeInTheDocument();
    const modules = screen.getByRole('region', { name: 'Modules' });
    expect(within(modules).getByText('Run by a recorded world').nextElementSibling).toHaveTextContent('1');
    expect(within(modules).getByText('Run by no recorded world').nextElementSibling).toHaveTextContent('1');
  });

  test('lets Foundry manage packages again, and back', async () => {
    const { setup, onGuardChange, user } = await setUp();
    const box = screen.getByRole('checkbox', { name: 'Let Foundry install and update packages here' });
    expect(box).not.toBeChecked();

    await user.click(box);
    expect(onGuardChange).toHaveBeenLastCalledWith(false);
    expect(setup.guardOn).toBe(false);

    await user.click(box);
    expect(onGuardChange).toHaveBeenLastCalledWith(true);
  });

  test('shows a world: what it last ran with, and what has changed since', async () => {
    const { user } = await setUp();
    await toggle(user, /^D&D 5e/);

    await user.click(screen.getByRole('treeitem', { name: /Alpha/ }));

    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Foundry VTT 14.360, D&D 5e 5.3.3')).toBeInTheDocument();
    const changes = screen.getByRole('region', { name: 'Changed since it last ran' });
    expect(
      within(changes)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual([
      'Foundry VTT: last ran with 14.360, 14.368 installed',
      'Gone: last ran with 2.0.0, not installed',
      'Library: last ran with 1.0.0, 1.1.0 installed',
    ]);
  });

  test.each([
    ['Beta', /^pf2e/, 'This world has no record'],
    ['Gamma', /^D&D 5e/, "EMMA cannot read this world's record"],
  ])('explains why %s shows no modules', async (title, system, text) => {
    const { user } = await setUp();
    await toggle(user, system);

    await user.click(screen.getByRole('treeitem', { name: new RegExp(title) }));

    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByText('Last ran with')).toBeNull();
  });

  test("names a world's system by its ID while it is not installed", async () => {
    const { user } = await setUp();
    await toggle(user, /^pf2e/);

    await user.click(screen.getByRole('treeitem', { name: /Beta/ }));

    expect(screen.getByText('Game system').nextElementSibling).toHaveTextContent('pf2e');
  });

  test('shows a module a world runs, and the worlds that run it', async () => {
    const { user } = await setUp();
    await toggle(user, /^D&D 5e/);
    await user.click(screen.getByRole('treeitem', { name: /Alpha/ }));
    await user.keyboard('{ArrowRight}');

    await user.click(screen.getByRole('treeitem', { name: /Library/ }));

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('In Alpha')).toBeInTheDocument();
    expect(screen.getByText('Installed').nextElementSibling).toHaveTextContent('1.1.0');
    expect(screen.getByText('Last ran with').nextElementSibling).toHaveTextContent('1.0.0');
    expect(items('Run by')).toEqual(['Alpha', 'Delta']);
    expect(items('Required by')).toEqual(['Idle']);

    await user.click(screen.getByRole('treeitem', { name: /Gone/ }));
    expect(screen.getByText('Installed').nextElementSibling).toHaveTextContent('Not installed');
    expect(screen.queryByText('Game systems', { selector: 'dt' })).toBeNull();
  });

  test('shows an installed module: the game systems it is for, what it requires, and that no world runs it', async () => {
    const { user } = await setUp();
    await toggle(user, /^D&D 5e/);
    await user.click(screen.getAllByRole('treeitem', { name: /^D&D 5e/ })[1] as HTMLElement);
    expect(screen.getByRole('heading', { name: 'D&D 5e' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(screen.getByRole('heading', { name: 'Idle' })).toBeInTheDocument();
    expect(screen.queryByText(/^In /)).toBeNull();
    expect(screen.getByText('Game systems', { selector: 'dt' }).nextElementSibling).toHaveTextContent('D&D 5e');
    expect(items('Requires')).toEqual(['Library']);
    expect(screen.getByText('No recorded world runs this module.')).toBeInTheDocument();
  });

  test('shows a game system: its version, its worlds, and how many modules are for it', async () => {
    const { user } = await setUp();

    await user.click(row(/^D&D 5e/));
    expect(screen.getByRole('heading', { name: 'D&D 5e' })).toBeInTheDocument();
    expect(screen.getByText('Installed').nextElementSibling).toHaveTextContent('5.3.3');
    expect(screen.getByText('Modules for it').nextElementSibling).toHaveTextContent('1');
    expect(items('Worlds')).toEqual(['Alpha', 'Gamma', 'Delta']);

    await user.click(row(/^pf2e/));
    expect(screen.getByText('Installed').nextElementSibling).toHaveTextContent('Not installed');
  });

  test('shows what the groups hold', async () => {
    const { user } = await setUp();

    await user.click(row(/^Game systems/));
    expect(screen.getByRole('heading', { name: 'Game systems' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map(item => item.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'D&D 5e 3 worlds',
      'pf2e 1 worlds',
    ]);

    await user.click(row(/^Modules/));
    expect(screen.getByText(/^2 modules installed/)).toBeInTheDocument();

    await user.click(row(/^Universal/));
    expect(screen.getByText('Modules that name no game system, for use with any.')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});
