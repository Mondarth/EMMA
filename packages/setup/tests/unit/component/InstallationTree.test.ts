import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import InstallationTree from '../../../src/component/InstallationTree.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { TreeSelection } from '../../../src/lib/tree';
import { installation, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    worlds: [
      { id: 'a', title: 'Alpha', system: 'dnd5e' },
      { id: 'b', title: 'Beta', system: 'dnd5e' },
    ],
    modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }],
  }),
  new Map([['a', recorded(record('a', { modules: [{ id: 'lib', title: 'Library', version: '1.0.0' }] }))]]),
);

/**
 * Render the tree, following the selection as the window does.
 * @returns A user to act with, and the selection callback
 */
function setUp() {
  const onSelect = vi.fn();
  const view = render(InstallationTree, { overview: OVERVIEW, selection: { kind: 'root' } as TreeSelection, onSelect });
  onSelect.mockImplementation((selection: TreeSelection) => view.rerender({ selection }));
  return { user: userEvent.setup(), onSelect };
}

/**
 * The tree's rows, as their accessible names give them.
 * @returns The rows' names
 */
const rows = () => screen.getAllByRole('treeitem').map(row => row.textContent.replace(/\s+/g, ' ').trim());

describe('InstallationTree', () => {
  test('shows the root expanded, its worlds with their statuses', () => {
    setUp();

    expect(screen.getByRole('tree', { name: 'Installation' })).toBeInTheDocument();
    expect(rows()).toEqual(['Foundry VTT 14.368', 'Alpha Matches its record', 'Beta No record']);
    expect(screen.getByRole('treeitem', { name: /Foundry/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: /Alpha/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('treeitem', { name: /Beta/ })).not.toHaveAttribute('aria-expanded');
  });

  test('is driven from the keyboard, the selection following it', async () => {
    const { user, onSelect } = setUp();
    screen.getByRole('treeitem', { name: /Foundry/ }).focus();

    await user.keyboard('{ArrowDown}');
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'world', world: 'a' });
    expect(screen.getByRole('treeitem', { name: /Alpha/ })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(rows()).toContain('Library 1.0.0 Installed');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: /Library/ })).toHaveFocus();
    expect(screen.getByRole('treeitem', { name: /Library/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(rows()).not.toContain('Library 1.0.0 Installed');

    await user.keyboard('{End}');
    expect(screen.getByRole('treeitem', { name: /Beta/ })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('treeitem', { name: /Beta/ })).toHaveFocus();
  });

  test('selects a row on a click, and expands or collapses it from its triangle', async () => {
    const { user, onSelect } = setUp();
    const alpha = screen.getByRole('treeitem', { name: /Alpha/ });

    await user.click(alpha);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'world', world: 'a' });
    expect(alpha).toHaveAttribute('aria-expanded', 'false');

    const toggle = alpha.querySelector('.emma-tree-toggle');
    if (toggle === null) throw new Error('No triangle');
    await user.click(toggle);
    expect(alpha).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('treeitem', { name: /Foundry/ }).querySelector('.emma-tree-toggle') ?? alpha);
    expect(rows()).toEqual(['Foundry VTT 14.368']);
  });
});
