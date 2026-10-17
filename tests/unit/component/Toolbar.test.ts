import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import Toolbar from '@component/Toolbar.svelte';
import { installFoundryMocks } from '../mocks/foundry';

const LIST = 'MONDARTH-EMMA.Toolbar.List';
const SPLIT = 'MONDARTH-EMMA.Toolbar.Split';

describe('Toolbar', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('is a labelled toolbar', () => {
    render(Toolbar, { view: 'list', onViewChange: vi.fn() });

    expect(screen.getByRole('toolbar', { name: 'MONDARTH-EMMA.Toolbar.Label' })).toBeInTheDocument();
  });

  test('offers the list and split views as icon buttons with tooltips', () => {
    render(Toolbar, { view: 'list', onViewChange: vi.fn() });

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
    render(Toolbar, { view, onViewChange: vi.fn() });

    expect(screen.getByRole('button', { name: pressed, pressed: true })).toHaveClass('active');
    expect(screen.getByRole('button', { name: other, pressed: false })).not.toHaveClass('active');
  });

  test('reports the view picked', async () => {
    const onViewChange = vi.fn();
    render(Toolbar, { view: 'list', onViewChange });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));

    expect(onViewChange).toHaveBeenCalledExactlyOnceWith('split');
  });

  test('follows the view it is given', async () => {
    const { rerender } = render(Toolbar, { view: 'list', onViewChange: vi.fn() });

    await rerender({ view: 'split' });

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
  });
});
