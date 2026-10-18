import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import Toolbar from '@component/Toolbar.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';

const LIST = 'MONDARTH-EMMA.Toolbar.List';
const SPLIT = 'MONDARTH-EMMA.Toolbar.Split';
const EXPAND = 'MONDARTH-EMMA.Toolbar.Expand';
const COLLAPSE = 'MONDARTH-EMMA.Toolbar.Collapse';

describe('Toolbar', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('is a labelled toolbar', () => {
    render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

    expect(screen.getByRole('toolbar', { name: 'MONDARTH-EMMA.Toolbar.Label' })).toBeInTheDocument();
  });

  test('offers the list and split views as icon buttons with tooltips', () => {
    render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

    const list = screen.getByRole('button', { name: LIST });
    const split = screen.getByRole('button', { name: SPLIT });
    expect(list).toHaveClass('icon', 'fa-solid', 'fa-list');
    expect(split).toHaveClass('icon', 'fa-solid', 'fa-table-columns');
    expect(list).toHaveAttribute('data-tooltip', LIST);
    expect(list).toBeEmptyDOMElement();
  });

  test.each([
    ['list', LIST, SPLIT],
    ['split', SPLIT, LIST],
  ] as const)('marks the %s view as pressed', (view, pressed, other) => {
    render(Toolbar, { modules: createModules(), view, onViewChange: vi.fn() });

    expect(screen.getByRole('button', { name: pressed, pressed: true })).toHaveClass('active');
    expect(screen.getByRole('button', { name: other, pressed: false })).not.toHaveClass('active');
  });

  test('reports the view picked', async () => {
    const onViewChange = vi.fn();
    render(Toolbar, { modules: createModules(), view: 'list', onViewChange });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));

    expect(onViewChange).toHaveBeenCalledExactlyOnceWith('split');
  });

  test('follows the view it is given', async () => {
    const { rerender } = render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

    await rerender({ view: 'split' });

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
  });

  describe('expand button', () => {
    test('sits at the far right, after the view buttons', () => {
      render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      const button = screen.getByRole('button', { name: EXPAND });
      expect(screen.getByRole('toolbar').lastElementChild).toBe(button);
      expect(button).toHaveClass('icon', 'fa-solid', 'fa-angles-up');
      expect(button).toHaveAttribute('data-tooltip', EXPAND);
    });

    test('opens every drawer, then closes them all', async () => {
      const modules = createModules();
      render(Toolbar, { modules, view: 'list', onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: EXPAND }));

      expect(modules.allExpanded).toBe(true);
      const collapse = screen.getByRole('button', { name: COLLAPSE });
      expect(collapse).toHaveClass('fa-angles-down');

      await userEvent.click(collapse);

      expect(modules.entries.some(({ id }) => modules.isExpanded(id))).toBe(false);
      expect(screen.getByRole('button', { name: EXPAND })).toBeInTheDocument();
    });

    test('opens the rest when only some drawers are open', async () => {
      const modules = createModules();
      modules.toggleExpanded('emma');
      render(Toolbar, { modules, view: 'list', onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: EXPAND }));

      expect(modules.allExpanded).toBe(true);
    });

    test('follows drawers opened and closed elsewhere', async () => {
      const modules = createModules();
      render(Toolbar, { modules, view: 'list', onViewChange: vi.fn() });

      modules.setAllExpanded(true);

      expect(await screen.findByRole('button', { name: COLLAPSE })).toBeInTheDocument();
    });

    test('is disabled when no module is installed', () => {
      render(Toolbar, { modules: createModules({}, []), view: 'list', onViewChange: vi.fn() });

      expect(screen.getByRole('button', { name: EXPAND })).toBeDisabled();
    });
  });

  describe('grouping toggle', () => {
    const GROUP = 'MONDARTH-EMMA.Toolbar.Group';

    test('is offered in the list view only, to the left of the view buttons', async () => {
      const { rerender } = render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      const group = screen.getByRole('button', { name: GROUP });
      expect(group).toHaveClass('icon', 'fa-solid', 'fa-sitemap');
      expect(group).toHaveAttribute('data-tooltip', GROUP);
      expect(
        group.compareDocumentPosition(screen.getByRole('button', { name: LIST })) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await rerender({ view: 'split' });

      expect(screen.queryByRole('button', { name: GROUP })).toBeNull();
    });

    test.each([true, false])('shows grouping as pressed or not (%s), and asks for the opposite', async grouped => {
      const onGroupedChange = vi.fn();
      render(Toolbar, { modules: createModules(), view: 'list', grouped, onViewChange: vi.fn(), onGroupedChange });
      const group = screen.getByRole('button', { name: GROUP });
      expect(group).toHaveAttribute('aria-pressed', String(grouped));

      await userEvent.click(group);

      expect(onGroupedChange).toHaveBeenCalledExactlyOnceWith(!grouped);
    });

    test('is harmless without a handler', async () => {
      render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: GROUP }));

      expect(screen.getByRole('button', { name: GROUP })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
