import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import InstallationTree from '../../../src/component/InstallationTree.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { TreeRow } from '../../../src/lib/tree';
import { ROOT } from '../../../src/lib/tree';
import { alone, installation, installedModule, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'a', title: 'Alpha', system: 'dnd5e' },
      { id: 'b', title: 'Beta', system: 'dnd5e' },
    ],
    modules: [installedModule('lib', 'Library', '1.0.0')],
  }),
  new Map([['a', recorded(record('a', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))]]),
);

/**
 * Render the tree, following the selection as the window does.
 * @param selected - The key of the row selected at first
 * @returns A user to act with, and the selection callback
 */
function setUp(selected = ROOT) {
  const onSelect = vi.fn();
  const view = render(InstallationTree, { overview: OVERVIEW, selected, onSelect });
  onSelect.mockImplementation((chosen: TreeRow) => view.rerender({ selected: chosen.key }));
  return { user: userEvent.setup(), onSelect };
}

/**
 * The tree's rows, as their text gives them.
 * @returns The rows' text
 */
const rows = () => screen.getAllByRole('treeitem').map(item => item.textContent.replace(/\s+/g, ' ').trim());

/**
 * A row, by its name.
 * @param name - The name
 * @returns The row
 */
const row = (name: RegExp) => screen.getByRole('treeitem', { name });

describe('InstallationTree', () => {
  test('shows the root, the game systems and the modules expanded, with the groups under them', () => {
    setUp();

    expect(screen.getByRole('tree', { name: 'Installation' })).toBeInTheDocument();
    expect(rows()).toEqual([
      'Foundry VTT 14.368',
      'Game systems',
      'D&D 5e 5.3.3 In use, Current state',
      'Modules',
      'Universal',
    ]);
    expect(row(/Foundry/)).toHaveAttribute('aria-expanded', 'true');
    expect(row(/Foundry/)).toHaveAttribute('aria-level', '1');
    expect(row(/D&D 5e/)).toHaveAttribute('aria-expanded', 'false');
    expect(row(/D&D 5e/)).toHaveAttribute('aria-level', '3');
  });

  test('is driven from the keyboard, the selection following it', async () => {
    const { user, onSelect } = setUp();
    row(/Foundry/).focus();

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ selection: { kind: 'system', system: 'dnd5e' } }),
    );
    expect(row(/D&D 5e/)).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(rows()).toContain('Alpha Matches its record, Current state');

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(rows()).toContain('Library 1.0.0 In use, Current state');
    // The world's game system comes first, then its modules.
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ selection: { kind: 'system', system: 'dnd5e', world: 'a' } }),
    );
    await user.keyboard('{ArrowDown}');
    expect(row(/Library/)).toHaveFocus();
    expect(row(/Library/)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(rows()).not.toContain('Library 1.0.0 In use, Current state');

    await user.keyboard('{End}');
    expect(row(/Universal/)).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(row(/Universal/)).toHaveFocus();
  });

  test('selects a row on a click, and expands or collapses it from its triangle', async () => {
    const { user, onSelect } = setUp();
    const universal = row(/Universal/);

    await user.click(universal);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ selection: { kind: 'group' } }));
    expect(universal).toHaveAttribute('aria-expanded', 'false');

    const toggle = universal.querySelector('.emma-tree-toggle');
    if (toggle === null) throw new Error('No triangle');
    await user.click(toggle);
    expect(universal).toHaveAttribute('aria-expanded', 'true');
    expect(rows()).toContain('Library 1.0.0');

    await user.click(row(/Foundry/).querySelector('.emma-tree-toggle') ?? universal);
    expect(rows()).toEqual(['Foundry VTT 14.368']);
  });

  test('can be reached from the keyboard while the row selected is hidden', async () => {
    const { user } = setUp('root/modules/universal/module:lib');

    expect(row(/Foundry/)).toHaveAttribute('tabindex', '0');
    expect(row(/Foundry/)).toHaveAttribute('aria-selected', 'false');
    row(/Foundry/).focus();
    await user.keyboard('{ArrowDown}');
    expect(row(/Game systems/)).toHaveFocus();
  });
});

describe("the tree's status badges", () => {
  test('say a game system is in use only where a world uses it', () => {
    const overview = buildOverview(
      installation({
        worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }],
        systems: [
          { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
          { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
        ],
      }),
      new Map(),
    );
    render(InstallationTree, { overview, selected: ROOT, onSelect: vi.fn() });

    expect(row(/D&D 5e/)).toHaveTextContent('In use');
    expect(row(/Pathfinder/)).not.toHaveTextContent('In use');
  });

  test('say the current state, or, in their own colour, that the plan changes the package or the world', async () => {
    const UPDATE = { key: 'module:lib', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };
    const updates = new UpdateState(() =>
      Promise.resolve({
        updates: new Map([[UPDATE.key, UPDATE]]),
        blocked: new Map(),
        unresolved: [],
        judge: (_key: string, version: string) => ({ version, badge: null }),
        planner: alone(UPDATE),
      }),
    );
    await updates.searchFor(OVERVIEW);
    render(InstallationTree, { overview: OVERVIEW, selected: ROOT, onSelect: vi.fn(), updates });
    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole('treeitem', { name: /D&D 5e 5\.3\.3/ })[0]?.querySelector('.emma-tree-toggle') as Element,
    );
    await user.click(row(/Alpha/).querySelector('.emma-tree-toggle') as Element);
    const badge = (name: RegExp) =>
      within(row(name)).getByText(/Matches|In use|No record/, { selector: '.emma-status' });

    expect(badge(/Alpha/)).toHaveAttribute('data-tooltip', 'Current state');

    await updates.choose('module:lib', '2.0.0');

    await vi.waitFor(() => {
      expect(badge(/Alpha/)).toHaveAttribute('data-tooltip', 'Planned update: the plan changes this');
    });
    expect(badge(/Alpha/)).toHaveClass('emma-status-planned');
    expect(badge(/Library/)).toHaveClass('emma-status-planned');
    // Beta has no record, so what it runs is not known; Foundry VTT does not change.
    expect(badge(/Beta/)).toHaveAttribute('data-tooltip', 'Current state');
    expect(row(/Alpha/)).toHaveTextContent('Planned update: the plan changes this');
  });
});
