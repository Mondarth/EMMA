import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import ListView from '@component/ListView.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';

describe('ListView', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('lists every installed module in display order', () => {
    render(ListView, { modules: createModules(), canManage: true });

    const list = screen.getByRole('list', { name: 'MONDARTH-EMMA.List.Label' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map(item => item.querySelector('.emma-module-title')?.textContent);
    expect(titles).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
  });

  test('shows each module’s version', () => {
    render(ListView, { modules: createModules(), canManage: true });

    const dice = screen.getByRole('checkbox', { name: 'Dice So Nice!' }).closest('li') as HTMLElement;
    expect(within(dice).getByText('5.2.4')).toBeInTheDocument();
  });

  test('checks the active modules', () => {
    render(ListView, { modules: createModules(), canManage: true });

    expect(screen.getByRole('checkbox', { name: 'libWrapper' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).not.toBeChecked();
  });

  test('stages a change when a module is checked or unchecked', async () => {
    const modules = createModules();
    render(ListView, { modules, canManage: true });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'libWrapper' }));

    expect(modules.changes).toEqual({ emma: true, 'lib-wrapper': false });
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
  });

  test('toggles a module from its title too', async () => {
    const modules = createModules();
    render(ListView, { modules, canManage: true });

    await userEvent.click(screen.getByText('EMMA'));

    expect(modules.isActive('emma')).toBe(true);
  });

  test('marks modules with a staged change', async () => {
    render(ListView, { modules: createModules(), canManage: true });
    const emma = screen.getByRole('checkbox', { name: 'EMMA' });

    await userEvent.click(emma);
    expect(emma.closest('li')).toHaveClass('changed');

    await userEvent.click(emma);
    expect(emma.closest('li')).not.toHaveClass('changed');
  });

  test('follows changes made elsewhere', async () => {
    const modules = createModules();
    render(ListView, { modules, canManage: true });

    modules.select('inactive', 'dice');
    modules.activateSelected();

    expect(await screen.findByRole('checkbox', { name: 'Dice So Nice!', checked: true })).toBeInTheDocument();
  });

  test('disables the checkboxes for a user who may not manage modules', () => {
    render(ListView, { modules: createModules(), canManage: false });

    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'libWrapper' })).toBeChecked();
  });

  describe('drawers', () => {
    const SHOW_DICE = 'MONDARTH-EMMA.Drawer.Show {"module":"Dice So Nice!"}';
    const HIDE_DICE = 'MONDARTH-EMMA.Drawer.Hide {"module":"Dice So Nice!"}';

    test('puts a closed disclosure triangle at the far right of each module', () => {
      render(ListView, { modules: createModules(), canManage: true });

      const button = screen.getByRole('button', { name: SHOW_DICE });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button.querySelector('i')).toHaveClass('fa-solid', 'fa-caret-right');
      expect(button.parentElement?.lastElementChild).toBe(button);
      expect(screen.getAllByRole('button')).toHaveLength(3);
    });

    test('opens a drawer below the module, then closes it', async () => {
      const modules = createModules();
      render(ListView, { modules, canManage: true });

      await userEvent.click(screen.getByRole('button', { name: SHOW_DICE }));

      const button = screen.getByRole('button', { name: HIDE_DICE });
      const drawer = document.getElementById(button.getAttribute('aria-controls') as string) as HTMLElement;
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button.querySelector('i')).toHaveClass('fa-caret-down');
      expect(button.querySelector('i')).not.toHaveClass('fa-caret-right');
      expect(drawer).toHaveTextContent('Rolls 3D dice.');
      expect(button.compareDocumentPosition(drawer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(button.closest('li')).toContainElement(drawer);

      await userEvent.click(button);

      expect(drawer).not.toBeInTheDocument();
      expect(modules.isExpanded('dice')).toBe(false);
    });

    test('does not change the module’s activation', async () => {
      const modules = createModules();
      render(ListView, { modules, canManage: true });

      await userEvent.click(screen.getByRole('button', { name: SHOW_DICE }));

      expect(modules.dirty).toBe(false);
    });

    test('keeps several drawers open at once', async () => {
      render(ListView, { modules: createModules(), canManage: true });

      for (const button of screen.getAllByRole('button')) await userEvent.click(button);

      expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(3);
    });

    test('toggles with the right arrow key from the triangle or the checkbox', async () => {
      const modules = createModules();
      render(ListView, { modules, canManage: true });

      screen.getByRole('button', { name: SHOW_DICE }).focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(modules.isExpanded('dice')).toBe(true);

      screen.getByRole('checkbox', { name: 'Dice So Nice!' }).focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(modules.isExpanded('dice')).toBe(false);
      expect(modules.dirty).toBe(false);
    });

    test.each(['Alt', 'Control', 'Meta', 'Shift'])('ignores the right arrow key with %s', async modifier => {
      const modules = createModules();
      render(ListView, { modules, canManage: true });

      screen.getByRole('checkbox', { name: 'Dice So Nice!' }).focus();
      await userEvent.keyboard(`{${modifier}>}{ArrowRight}{/${modifier}}{ArrowLeft}`);

      expect(modules.isExpanded('dice')).toBe(false);
    });

    test('opens for a user who may not manage modules', async () => {
      const modules = createModules();
      render(ListView, { modules, canManage: false });

      await userEvent.click(screen.getByRole('button', { name: SHOW_DICE }));

      expect(modules.isExpanded('dice')).toBe(true);
    });
  });

  test('says so when no module is installed', () => {
    render(ListView, { modules: createModules({}, []), canManage: true });

    expect(screen.getByText('MONDARTH-EMMA.List.Empty')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
