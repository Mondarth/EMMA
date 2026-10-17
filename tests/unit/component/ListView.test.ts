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
    render(ListView, { modules: createModules() });

    const list = screen.getByRole('list', { name: 'MONDARTH-EMMA.List.Label' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map(item => item.querySelector('.emma-module-title')?.textContent);
    expect(titles).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
  });

  test('shows each module’s version and authors', () => {
    render(ListView, { modules: createModules() });

    const dice = screen.getByRole('checkbox', { name: 'Dice So Nice!' }).closest('li') as HTMLElement;
    expect(within(dice).getByText('5.2.4')).toBeInTheDocument();
    expect(within(dice).getByText('Simone, JDW')).toBeInTheDocument();
  });

  test('leaves out the authors of a module that names none', () => {
    render(ListView, { modules: createModules() });

    const emma = screen.getByRole('checkbox', { name: 'EMMA' }).closest('li') as HTMLElement;
    expect(emma.querySelector('.emma-module-authors')).toBeNull();
  });

  test('checks the active modules', () => {
    render(ListView, { modules: createModules() });

    expect(screen.getByRole('checkbox', { name: 'libWrapper' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).not.toBeChecked();
  });

  test('stages a change when a module is checked or unchecked', async () => {
    const modules = createModules();
    render(ListView, { modules });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'libWrapper' }));

    expect(modules.changes).toEqual({ emma: true, 'lib-wrapper': false });
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
  });

  test('toggles a module from its title too', async () => {
    const modules = createModules();
    render(ListView, { modules });

    await userEvent.click(screen.getByText('EMMA'));

    expect(modules.isActive('emma')).toBe(true);
  });

  test('marks modules with a staged change', async () => {
    render(ListView, { modules: createModules() });
    const emma = screen.getByRole('checkbox', { name: 'EMMA' });

    await userEvent.click(emma);
    expect(emma.closest('li')).toHaveClass('changed');

    await userEvent.click(emma);
    expect(emma.closest('li')).not.toHaveClass('changed');
  });

  test('follows changes made elsewhere', async () => {
    const modules = createModules();
    render(ListView, { modules });

    modules.select('inactive', 'dice');
    modules.activateSelected();

    expect(await screen.findByRole('checkbox', { name: 'Dice So Nice!', checked: true })).toBeInTheDocument();
  });

  test('says so when no module is installed', () => {
    render(ListView, { modules: createModules({}, []) });

    expect(screen.getByText('MONDARTH-EMMA.List.Empty')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
