import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import SelectableList from '@component/SelectableList.svelte';
import type { ModuleState } from '@module/state/module-state.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules, ENTRIES } from './fixtures';
import { DrawerFields } from '@module/state/drawer-fields.svelte';

/** All three fixture modules inactive, in display order: Dice So Nice!, EMMA, libWrapper. */
const ALL_INACTIVE = {};

/**
 * Render the inactive side of `modules`, labelled by a heading.
 * @param modules - The state
 * @returns The treegrid
 */
function renderInactive(modules: ModuleState): HTMLElement {
  const heading = document.createElement('h3');
  heading.id = 'heading';
  heading.textContent = 'Inactive';
  document.body.append(heading);
  render(SelectableList, { fields: new DrawerFields(), modules, side: 'inactive', labelledby: 'heading' });
  return screen.getByRole('treegrid');
}

/**
 * The row for a fixture module.
 * @param title - The module title
 * @returns The row
 */
function option(title: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^${title}`) });
}

/**
 * The titles of the selected rows.
 * @returns The titles, in display order
 */
function selectedTitles(): string[] {
  return screen
    .getAllByRole('row', { selected: true })
    .map(element => element.querySelector('.emma-option-title')?.textContent ?? '');
}

describe('SelectableList', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    installFoundryMocks();
  });

  describe('structure', () => {
    test('is a multi-select treegrid named by its heading', () => {
      const grid = renderInactive(createModules());

      expect(screen.getByRole('treegrid', { name: 'Inactive' })).toBe(grid);
      expect(grid).toHaveAttribute('aria-multiselectable', 'true');
      expect(grid).toHaveAttribute('tabindex', '0');
    });

    test('lists only the modules on its side, with their versions', () => {
      renderInactive(createModules());

      expect(screen.getAllByRole('row').map(element => element.textContent.replace(/\s+/g, ' ').trim())).toEqual([
        'Dice So Nice! 5.2.4 Verified',
        'EMMA 0.1.0',
      ]);
    });

    test('marks modules with a staged change', () => {
      const modules = createModules();
      // libWrapper is saved as active, so deactivating it is a change; EMMA is changed and changed back.
      modules.setActive('lib-wrapper', false);
      modules.setActive('emma', true);
      modules.setActive('emma', false);
      renderInactive(modules);

      expect(option('libWrapper')).toHaveClass('changed');
      expect(option('EMMA')).not.toHaveClass('changed');
      expect(option('Dice So Nice!')).not.toHaveClass('changed');
    });

    test('gives each row a document-unique ID', () => {
      const modules = createModules(ALL_INACTIVE);
      renderInactive(modules);
      render(SelectableList, { fields: new DrawerFields(), modules, side: 'inactive', labelledby: 'heading' });

      const ids = screen.getAllByRole('row').map(element => element.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('lists nothing when its side is empty', () => {
      renderInactive(createModules(Object.fromEntries(ENTRIES.map(({ id }) => [id, true]))));

      expect(screen.queryAllByRole('row')).toHaveLength(0);
    });
  });

  describe('mouse', () => {
    test('selects the clicked module', async () => {
      renderInactive(createModules(ALL_INACTIVE));

      await userEvent.click(option('EMMA'));
      await userEvent.click(option('libWrapper'));

      expect(selectedTitles()).toEqual(['libWrapper']);
    });

    test('toggles with Ctrl-click and with Cmd-click', async () => {
      renderInactive(createModules(ALL_INACTIVE));
      const user = userEvent.setup();

      await user.click(option('Dice So Nice!'));
      await user.keyboard('{Control>}');
      await user.click(option('libWrapper'));
      await user.keyboard('{/Control}{Meta>}');
      await user.click(option('Dice So Nice!'));
      await user.keyboard('{/Meta}');

      expect(selectedTitles()).toEqual(['libWrapper']);
    });

    test('selects a range with Shift-click', async () => {
      renderInactive(createModules(ALL_INACTIVE));
      const user = userEvent.setup();

      await user.click(option('Dice So Nice!'));
      await user.keyboard('{Shift>}');
      await user.click(option('libWrapper'));
      await user.keyboard('{/Shift}');

      expect(selectedTitles()).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
    });

    test('moves the keyboard to the clicked module', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));

      await userEvent.click(option('EMMA'));

      expect(grid).toHaveAttribute('aria-activedescendant', option('EMMA').id);
    });
  });

  describe('drawers', () => {
    const SHOW_EMMA = 'MONDARTH-EMMA.Drawer.Show {"module":"EMMA"}';

    test('names each row by its module title alone', () => {
      renderInactive(createModules(ALL_INACTIVE));

      expect(screen.getAllByRole('row').map(row => row.getAttribute('aria-level'))).toEqual(['1', '1', '1']);
      expect(screen.getByRole('row', { name: 'EMMA' })).toHaveAttribute('aria-expanded', 'false');
    });

    test('keeps the triangles out of the Tab order, since the treegrid holds focus', () => {
      renderInactive(createModules(ALL_INACTIVE));

      expect(screen.getByRole('button', { name: SHOW_EMMA })).toHaveAttribute('tabindex', '-1');
    });

    test('puts each triangle in the last cell of its row', () => {
      renderInactive(createModules(ALL_INACTIVE));

      const cells = within(option('EMMA')).getAllByRole('gridcell');
      expect(cells.at(-1)).toContainElement(screen.getByRole('button', { name: SHOW_EMMA }));
    });

    test('opens a drawer in a child row below the module without selecting it, then closes it', async () => {
      renderInactive(createModules(ALL_INACTIVE));

      await userEvent.click(screen.getByRole('button', { name: SHOW_EMMA }));

      const row = option('EMMA');
      const drawerRow = row.nextElementSibling as HTMLElement;
      expect(row).toHaveAttribute('aria-expanded', 'true');
      expect(row).toHaveAttribute('aria-selected', 'false');
      expect(drawerRow).toHaveAttribute('role', 'row');
      expect(drawerRow).toHaveAttribute('aria-level', '2');
      expect(drawerRow).not.toHaveAttribute('aria-selected');
      expect(within(drawerRow).getByRole('gridcell')).toHaveTextContent('MONDARTH-EMMA.Drawer.Empty');

      await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Drawer.Hide {"module":"EMMA"}' }));

      expect(row).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getAllByRole('row')).toHaveLength(3);
    });

    test('keeps the selection when a drawer opens', async () => {
      renderInactive(createModules(ALL_INACTIVE));

      await userEvent.click(option('libWrapper'));
      await userEvent.click(screen.getByRole('button', { name: SHOW_EMMA }));

      expect(selectedTitles()).toEqual(['libWrapper']);
    });

    test('toggles the keyboard’s row with the right arrow key, leaving the selection alone', async () => {
      const modules = createModules(ALL_INACTIVE);
      const grid = renderInactive(modules);
      grid.focus();

      await userEvent.keyboard('{ArrowDown}{Control>}{ArrowDown}{/Control}{ArrowRight}');
      expect(modules.isExpanded('emma')).toBe(true);
      expect(selectedTitles()).toEqual(['Dice So Nice!']);

      await userEvent.keyboard('{ArrowRight}');
      expect(modules.isExpanded('emma')).toBe(false);
    });

    test('moves over open drawers to the next module', async () => {
      const modules = createModules(ALL_INACTIVE);
      modules.toggleExpanded('dice');
      const grid = renderInactive(modules);
      grid.focus();

      await userEvent.keyboard('{ArrowDown}{ArrowDown}');

      expect(selectedTitles()).toEqual(['EMMA']);
    });

    test('ignores the right arrow key before the keyboard is on a row', async () => {
      const modules = createModules(ALL_INACTIVE);
      const grid = renderInactive(modules);
      grid.focus();

      await userEvent.keyboard('{ArrowRight}');

      expect(ENTRIES.some(({ id }) => modules.isExpanded(id))).toBe(false);
    });

    test('leaves keys pressed on a drawer’s links to the link', async () => {
      const modules = createModules(ALL_INACTIVE);
      modules.toggleExpanded('dice');
      renderInactive(modules);

      screen.getByRole('link', { name: 'Simone' }).focus();
      await userEvent.keyboard('{ArrowDown}{ArrowRight}');

      expect(screen.queryAllByRole('row', { selected: true })).toHaveLength(0);
      expect(modules.isExpanded('dice')).toBe(true);
    });
  });

  describe('keyboard', () => {
    test('has no active row until the keyboard moves', () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));

      expect(grid).not.toHaveAttribute('aria-activedescendant');
    });

    test('moves and selects with the arrow keys, stopping at the ends', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('{ArrowDown}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);

      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(selectedTitles()).toEqual(['libWrapper']);
      expect(grid).toHaveAttribute('aria-activedescendant', option('libWrapper').id);

      await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('starts at the top when ArrowUp is pressed first', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('{ArrowUp}');

      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('jumps to the ends with Home and End', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('{End}');
      expect(selectedTitles()).toEqual(['libWrapper']);

      await userEvent.keyboard('{Home}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('extends the selection with Shift', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('{ArrowDown}{Shift>}{ArrowDown}{ArrowDown}{/Shift}');

      expect(selectedTitles()).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
    });

    test('only moves with Ctrl, then toggles with Space', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('{ArrowDown}{Control>}{ArrowDown}{ArrowDown}{/Control}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);

      await userEvent.keyboard(' ');
      expect(selectedTitles()).toEqual(['Dice So Nice!', 'libWrapper']);

      await userEvent.keyboard(' ');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('puts the keyboard on the first module when Space is pressed first, selecting nothing', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard(' ');

      expect(grid).toHaveAttribute('aria-activedescendant', option('Dice So Nice!').id);
      expect(screen.queryAllByRole('row', { selected: true })).toHaveLength(0);
    });

    test.each(['Control', 'Meta'])('selects everything with %s+A', async modifier => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard(`{${modifier}>}a{/${modifier}}`);

      expect(selectedTitles()).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
    });

    test('selects everything with Ctrl+Shift+A too', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('{Control>}{Shift>}A{/Shift}{/Control}');

      expect(selectedTitles()).toHaveLength(3);
    });

    test('ignores A without Ctrl or Cmd, and other keys', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      grid.focus();

      await userEvent.keyboard('a{Enter}x');

      expect(screen.queryAllByRole('row', { selected: true })).toHaveLength(0);
      expect(grid).not.toHaveAttribute('aria-activedescendant');
    });

    test('ignores keys when its side is empty', async () => {
      const grid = renderInactive(createModules(Object.fromEntries(ENTRIES.map(({ id }) => [id, true]))));
      grid.focus();

      await userEvent.keyboard('{ArrowDown} ');

      expect(grid).not.toHaveAttribute('aria-activedescendant');
    });

    test('forgets the active row once it moves to the other side', async () => {
      const modules = createModules(ALL_INACTIVE);
      const grid = renderInactive(modules);
      grid.focus();
      await userEvent.keyboard('{ArrowDown}');

      modules.activateSelected();

      await expect.poll(() => grid.getAttribute('aria-activedescendant')).toBeNull();
    });

    test('scrolls the active row into view', async () => {
      const grid = renderInactive(createModules(ALL_INACTIVE));
      const scrolled: string[] = [];
      for (const element of screen.getAllByRole('row')) {
        element.scrollIntoView = () => {
          scrolled.push(element.id);
        };
      }
      grid.focus();

      await userEvent.keyboard('{End}');

      expect(scrolled).toEqual([option('libWrapper').id]);
    });
  });

  test('makes a module an active module requires unselectable, explaining why on hover', async () => {
    // Dice So Nice! requires libWrapper.
    const modules = createModules({ dice: true, 'lib-wrapper': true });
    render(SelectableList, { fields: new DrawerFields(), modules, side: 'active', labelledby: 'heading' });
    const library = option('libWrapper');

    expect(library).toHaveAttribute('aria-disabled', 'true');
    expect(library).toHaveClass('locked');
    expect(library).toHaveAttribute(
      'data-tooltip',
      'MONDARTH-EMMA.Requirements.Locked {"module":"libWrapper","parents":"Dice So Nice!"}',
    );
    expect(option('Dice So Nice!')).not.toHaveAttribute('aria-disabled');

    await userEvent.click(library);

    expect(library).toHaveAttribute('aria-selected', 'false');
  });
});
