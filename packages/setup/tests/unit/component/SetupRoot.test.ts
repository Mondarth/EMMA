import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SetupState } from '../../../src/app/setup-state.svelte';
import SetupRoot from '../../../src/component/SetupRoot.svelte';
import type { RecordState } from '../../../src/foundry/records';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, noInstall, noUpdates, record, recorded } from '../../mocks/fixtures';

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
  const setup = new SetupState({
    load: () => Promise.resolve(OVERVIEW),
    guardOn,
    onGuardChange,
    findUpdates: noUpdates,
    installModule: noInstall,
  });
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
      findUpdates: noUpdates,
      installModule: noInstall,
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
    expect(
      within(worlds)
        .getAllByRole('listitem')
        .map(item => item.textContent.replace(/\s+/g, ' ').trim()),
    ).toContain('D&D 5e: 3');
    expect(within(worlds).getByText(/has not been opened with EMMA 0\.9/)).toBeInTheDocument();
    const modules = screen.getByRole('region', { name: 'Modules' });
    expect(within(modules).getByText('Active in a recorded world').nextElementSibling).toHaveTextContent('1');
    expect(within(modules).getByText('Active in no recorded world').nextElementSibling).toHaveTextContent('1');
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

  test('shows a module a world runs, and the worlds it is active in', async () => {
    const { user } = await setUp();
    await toggle(user, /^D&D 5e/);
    await user.click(screen.getByRole('treeitem', { name: /Alpha/ }));
    await user.keyboard('{ArrowRight}');

    await user.click(screen.getByRole('treeitem', { name: /Library/ }));

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('In Alpha')).toBeInTheDocument();
    expect(screen.getByText('Installed', { selector: 'dt' }).nextElementSibling).toHaveTextContent('1.1.0');
    expect(screen.getByText('Last ran with').nextElementSibling).toHaveTextContent('1.0.0');
    expect(items('Active in')).toEqual(['Alpha', 'Delta']);
    expect(items('Required by')).toEqual(['Idle']);

    await user.click(screen.getByRole('treeitem', { name: /Gone/ }));
    expect(screen.getByText('Installed', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Not installed');
    expect(screen.queryByText('Game systems', { selector: 'dt' })).toBeNull();
  });

  test('shows an installed module: the game systems it is for, what it requires, and that no world runs it', async () => {
    const { user } = await setUp();
    await toggle(user, /^D&D 5e/);
    await user.click(screen.getAllByRole('treeitem', { name: /^D&D 5e/ })[1] as HTMLElement);
    expect(screen.getByRole('heading', { name: 'D&D 5e' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(screen.getByRole('heading', { name: 'Idle' })).toBeInTheDocument();
    expect(screen.queryByText(/^In \d/)).toBeNull();
    expect(screen.getByText('Game systems', { selector: 'dt' }).nextElementSibling).toHaveTextContent('D&D 5e');
    expect(items('Requires')).toEqual(['Library']);
    expect(screen.getByText('Not active in any recorded world.')).toBeInTheDocument();
  });

  test('shows a game system: its version, its worlds, and how many modules are for it', async () => {
    const { user } = await setUp();

    await user.click(row(/^D&D 5e/));
    expect(screen.getByRole('heading', { name: 'D&D 5e' })).toBeInTheDocument();
    expect(screen.getByText('Installed', { selector: 'dt' }).nextElementSibling).toHaveTextContent('5.3.3');
    expect(screen.getByText('Modules for it').nextElementSibling).toHaveTextContent('1');
    expect(items('Worlds')).toEqual([
      'Alpha last ran with 5.3.3 Installed',
      'Gamma',
      'Delta last ran with 5.3.3 Installed',
    ]);

    await user.click(row(/^pf2e/));
    expect(screen.getByText('Installed', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Not installed');
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

describe("the panels' links", () => {
  test('open the tree to what a panel names, and select it, from panel to panel', async () => {
    const { user } = await setUp();
    const selected = () => screen.getByRole('treeitem', { selected: true });

    await user.click(screen.getByRole('button', { name: 'Show D&D 5e in the tree' }));
    expect(selected()).toHaveTextContent(/^D&D 5e/);
    expect(screen.getByRole('heading', { name: 'D&D 5e', level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show Alpha in the tree' }));
    expect(selected()).toHaveTextContent(/^Alpha/);

    await user.click(screen.getByRole('button', { name: 'Show D&D 5e in the tree' }));
    expect(selected()).toHaveTextContent(/^D&D 5e/);

    // To a module in its group, opening the group, and on to what it requires.
    await user.click(row(/^Modules/));
    await user.click(screen.getByRole('button', { name: 'Show D&D 5e in the tree' }));
    await user.click(screen.getByRole('button', { name: 'Show Idle in the tree' }));
    expect(selected()).toHaveTextContent(/^Idle/);
    expect(selected().getAttribute('data-key')).toBe('root/modules/system:dnd5e/module:idle');
    await user.click(screen.getByRole('button', { name: 'Show Library in the tree' }));
    expect(selected()).toHaveTextContent(/^Library/);
    expect(selected().getAttribute('data-key')).toBe('root/modules/universal/module:lib');

    // Back to what requires it, and to it again.
    await user.click(screen.getByRole('button', { name: 'Show Idle in the tree' }));
    expect(selected()).toHaveTextContent(/^Idle/);
    await user.click(screen.getByRole('button', { name: 'Show Library in the tree' }));
    // On to a world it is active in, and from a module to the game system it is for.
    await user.click(screen.getByRole('button', { name: 'Show Delta in the tree' }));
    expect(selected().getAttribute('data-key')).toBe('root/systems/system:dnd5e/world:d');
    await user.click(row(/^Modules/));
    await user.click(screen.getByRole('button', { name: 'Show D&D 5e in the tree' }));
    await user.click(screen.getByRole('button', { name: 'Show Idle in the tree' }));
    await user.click(screen.getByRole('button', { name: 'Show D&D 5e in the tree' }));
    expect(selected().getAttribute('data-key')).toBe('root/systems/system:dnd5e');
  });
});

describe('ignoring', () => {
  test('ignores a world, a game system or a module from its panel, greying it in the tree, and stops', async () => {
    const ignored = new Set<string>();
    const ignore = vi.fn((key: string, on: boolean) => {
      if (on) ignored.add(key);
      else ignored.delete(key);
    });
    const setup = new SetupState({
      load: () => {
        const base = installation({
          worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }],
          modules: [installedModule('lib', 'Library', '1.1.0')],
        });
        return Promise.resolve(buildOverview({ ...base, ignored: [...ignored] }, new Map()));
      },
      guardOn: true,
      onGuardChange: vi.fn(),
      findUpdates: noUpdates,
      installModule: noInstall,
      ignore,
    });
    await setup.refresh();
    render(SetupRoot, { setup });
    const user = userEvent.setup();
    const section = () => screen.getByRole('region', { name: 'Ignore' });

    await toggle(user, /^D&D 5e/);
    await user.click(row(/^Alpha/));
    expect(screen.queryByRole('note')).toBeNull();
    expect(section()).toHaveTextContent('Ignoring Alpha leaves it out of every plan');
    await user.click(within(section()).getByRole('button', { name: 'Ignore Alpha' }));

    expect(ignore).toHaveBeenCalledWith('world:a', true);
    await vi.waitFor(() => {
      expect(screen.getByRole('note')).toHaveTextContent('Ignored');
    });
    expect(section()).toHaveTextContent('EMMA ignores Alpha');
    expect(row(/^Alpha/)).toHaveClass('emma-tree-ignored');
    expect(row(/^Alpha/)).toHaveAccessibleName(/^Alpha\s*, ignored/);

    // Still selectable, as are a game system and a module, which say so in their own words.
    await user.click(row(/^D&D 5e/));
    expect(screen.queryByRole('note')).toBeNull();
    await user.click(within(section()).getByRole('button', { name: 'Ignore D&D 5e' }));
    await vi.waitFor(() => {
      expect(section()).toHaveTextContent('EMMA ignores D&D 5e. No plan takes it into account: it is never updated');
    });
    await toggle(user, /^Universal/);
    await user.click(row(/^Library/));
    expect(section()).toHaveTextContent('Ignoring Library leaves it out of every plan');

    await user.click(row(/^Alpha/));
    await user.click(within(section()).getByRole('button', { name: 'Stop ignoring Alpha' }));
    expect(ignore).toHaveBeenLastCalledWith('world:a', false);
    await vi.waitFor(() => {
      expect(screen.queryByRole('note')).toBeNull();
    });
    expect(row(/^Alpha/)).not.toHaveClass('emma-tree-ignored');
  });

  test('is not offered where it cannot be kept', async () => {
    const { user } = await setUp();
    expect(screen.queryByRole('region', { name: 'Ignore' })).toBeNull();
    await toggle(user, /^D&D 5e/);
    await user.click(row(/^Alpha/));
    expect(screen.queryByRole('region', { name: 'Ignore' })).toBeNull();
  });
});
