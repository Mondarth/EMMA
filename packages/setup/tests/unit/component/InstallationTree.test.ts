import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import InstallationTree from '../../../src/component/InstallationTree.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { TreeRow } from '../../../src/lib/tree';
import { ROOT } from '../../../src/lib/tree';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

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
    expect(rows()).toEqual(['Foundry VTT 14.368', 'Game systems', 'D&D 5e 5.3.3', 'Modules', 'Universal']);
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
    expect(rows()).toContain('Alpha Matches its record');

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(rows()).toContain('Library 1.0.0 Installed');
    await user.keyboard('{ArrowRight}');
    expect(row(/Library/)).toHaveFocus();
    expect(row(/Library/)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(rows()).not.toContain('Library 1.0.0 Installed');

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
