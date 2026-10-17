import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import EmmaRoot from '@component/EmmaRoot.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';

const onSave = () => Promise.resolve();
const LIST = 'MONDARTH-EMMA.Toolbar.List';
const SPLIT = 'MONDARTH-EMMA.Toolbar.Split';

describe('EmmaRoot', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('shows the toolbar above the main pane', () => {
    render(EmmaRoot, { modules: createModules(), initialView: 'list', canManage: true, onSave });

    const toolbar = screen.getByRole('toolbar');
    const list = screen.getByRole('list');
    expect(toolbar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('starts in the list view when asked to', () => {
    render(EmmaRoot, { modules: createModules(), initialView: 'list', canManage: true, onSave });

    expect(screen.getByRole('button', { name: LIST })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'MONDARTH-EMMA.List.Label' })).toBeInTheDocument();
  });

  test('starts in the split view when asked to', () => {
    render(EmmaRoot, { modules: createModules(), initialView: 'split', canManage: true, onSave });

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('listbox')).toHaveLength(2);
    expect(screen.queryByRole('list')).toBeNull();
  });

  test('switches between the views and reports each switch', async () => {
    const onViewChange = vi.fn();
    render(EmmaRoot, { modules: createModules(), initialView: 'list', canManage: true, onSave, onViewChange });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));
    expect(screen.getAllByRole('listbox')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: LIST }));
    expect(screen.getByRole('list')).toBeInTheDocument();

    expect(onViewChange.mock.calls).toEqual([['split'], ['list']]);
  });

  test('does not report picking the view already shown', async () => {
    const onViewChange = vi.fn();
    render(EmmaRoot, { modules: createModules(), initialView: 'list', canManage: true, onSave, onViewChange });

    await userEvent.click(screen.getByRole('button', { name: LIST }));

    expect(onViewChange).not.toHaveBeenCalled();
  });

  test('switches view without anyone listening', async () => {
    render(EmmaRoot, { modules: createModules(), initialView: 'list', canManage: true, onSave });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps staged changes across view switches', async () => {
    const modules = createModules();
    render(EmmaRoot, { modules, initialView: 'list', canManage: true, onSave });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('button', { name: SPLIT }));
    await userEvent.click(screen.getByRole('button', { name: LIST }));

    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
    expect(modules.changes).toEqual({ emma: true });
  });

  test('keeps changes staged in the split view when switching to the list view', async () => {
    const modules = createModules();
    render(EmmaRoot, { modules, initialView: 'split', canManage: true, onSave });

    await userEvent.click(screen.getByRole('option', { name: /EMMA/ }));
    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Activate' }));
    await userEvent.click(screen.getByRole('button', { name: LIST }));

    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
  });

  test('shows the footer below the main pane', () => {
    render(EmmaRoot, { modules: createModules(), initialView: 'list', canManage: true, onSave });

    const list = screen.getByRole('list');
    const save = screen.getByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' });
    expect(list.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('saves through the callback it is given', async () => {
    const modules = createModules();
    const save = vi.fn(() => Promise.resolve());
    render(EmmaRoot, { modules, initialView: 'list', canManage: true, onSave: save });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' }));

    expect(save).toHaveBeenCalledOnce();
  });

  test.each(['list', 'split'] as const)('is read-only in the %s view for a user who may not manage modules', view => {
    render(EmmaRoot, { modules: createModules(), initialView: view, canManage: false, onSave });

    expect(screen.getByText('MONDARTH-EMMA.Footer.ReadOnly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' })).toBeNull();
  });

  test('leaves nothing behind when unmounted', () => {
    const { container, unmount } = render(EmmaRoot, {
      modules: createModules(),
      initialView: 'list',
      canManage: true,
      onSave,
    });

    unmount();

    expect(container).toBeEmptyDOMElement();
  });
});
