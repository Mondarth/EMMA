import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import SelectableList from '@component/SelectableList.svelte';
import type { ModuleState } from '@module/state/module-state.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules, ENTRIES } from './fixtures';

/** All three fixture modules inactive, in display order: Dice So Nice!, EMMA, libWrapper. */
const ALL_INACTIVE = {};

/**
 * Render the inactive side of `modules`, labelled by a heading.
 * @param modules - The state
 * @returns The listbox
 */
function renderInactive(modules: ModuleState): HTMLElement {
  const heading = document.createElement('h3');
  heading.id = 'heading';
  heading.textContent = 'Inactive';
  document.body.append(heading);
  render(SelectableList, { modules, side: 'inactive', labelledby: 'heading' });
  return screen.getByRole('listbox');
}

/**
 * The option for a fixture module.
 * @param title - The module title
 * @returns The option
 */
function option(title: string): HTMLElement {
  return screen.getByRole('option', { name: new RegExp(`^${title}`) });
}

/**
 * The titles of the selected options.
 * @returns The titles, in display order
 */
function selectedTitles(): string[] {
  return screen
    .getAllByRole('option', { selected: true })
    .map(element => element.querySelector('.emma-option-title')?.textContent ?? '');
}

describe('SelectableList', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    installFoundryMocks();
  });

  describe('structure', () => {
    test('is a multi-select listbox named by its heading', () => {
      const listbox = renderInactive(createModules());

      expect(screen.getByRole('listbox', { name: 'Inactive' })).toBe(listbox);
      expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
      expect(listbox).toHaveAttribute('tabindex', '0');
    });

    test('lists only the modules on its side, with their versions', () => {
      renderInactive(createModules());

      expect(screen.getAllByRole('option').map(element => element.textContent.replace(/\s+/g, ' ').trim())).toEqual([
        'Dice So Nice! 5.2.4',
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

    test('gives each option a document-unique ID', () => {
      const modules = createModules(ALL_INACTIVE);
      renderInactive(modules);
      render(SelectableList, { modules, side: 'inactive', labelledby: 'heading' });

      const ids = screen.getAllByRole('option').map(element => element.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('lists nothing when its side is empty', () => {
      renderInactive(createModules(Object.fromEntries(ENTRIES.map(({ id }) => [id, true]))));

      expect(screen.queryAllByRole('option')).toHaveLength(0);
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
      const listbox = renderInactive(createModules(ALL_INACTIVE));

      await userEvent.click(option('EMMA'));

      expect(listbox).toHaveAttribute('aria-activedescendant', option('EMMA').id);
    });
  });

  describe('keyboard', () => {
    test('has no active option until the keyboard moves', () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));

      expect(listbox).not.toHaveAttribute('aria-activedescendant');
    });

    test('moves and selects with the arrow keys, stopping at the ends', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('{ArrowDown}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);

      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(selectedTitles()).toEqual(['libWrapper']);
      expect(listbox).toHaveAttribute('aria-activedescendant', option('libWrapper').id);

      await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('starts at the top when ArrowUp is pressed first', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('{ArrowUp}');

      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('jumps to the ends with Home and End', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('{End}');
      expect(selectedTitles()).toEqual(['libWrapper']);

      await userEvent.keyboard('{Home}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('extends the selection with Shift', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('{ArrowDown}{Shift>}{ArrowDown}{ArrowDown}{/Shift}');

      expect(selectedTitles()).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
    });

    test('only moves with Ctrl, then toggles with Space', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('{ArrowDown}{Control>}{ArrowDown}{ArrowDown}{/Control}');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);

      await userEvent.keyboard(' ');
      expect(selectedTitles()).toEqual(['Dice So Nice!', 'libWrapper']);

      await userEvent.keyboard(' ');
      expect(selectedTitles()).toEqual(['Dice So Nice!']);
    });

    test('puts the keyboard on the first module when Space is pressed first, selecting nothing', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard(' ');

      expect(listbox).toHaveAttribute('aria-activedescendant', option('Dice So Nice!').id);
      expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0);
    });

    test.each(['Control', 'Meta'])('selects everything with %s+A', async modifier => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard(`{${modifier}>}a{/${modifier}}`);

      expect(selectedTitles()).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
    });

    test('selects everything with Ctrl+Shift+A too', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('{Control>}{Shift>}A{/Shift}{/Control}');

      expect(selectedTitles()).toHaveLength(3);
    });

    test('ignores A without Ctrl or Cmd, and other keys', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      listbox.focus();

      await userEvent.keyboard('a{Enter}x');

      expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0);
      expect(listbox).not.toHaveAttribute('aria-activedescendant');
    });

    test('ignores keys when its side is empty', async () => {
      const listbox = renderInactive(createModules(Object.fromEntries(ENTRIES.map(({ id }) => [id, true]))));
      listbox.focus();

      await userEvent.keyboard('{ArrowDown} ');

      expect(listbox).not.toHaveAttribute('aria-activedescendant');
    });

    test('forgets the active option once it moves to the other side', async () => {
      const modules = createModules(ALL_INACTIVE);
      const listbox = renderInactive(modules);
      listbox.focus();
      await userEvent.keyboard('{ArrowDown}');

      modules.activateSelected();

      await expect.poll(() => listbox.getAttribute('aria-activedescendant')).toBeNull();
    });

    test('scrolls the active option into view', async () => {
      const listbox = renderInactive(createModules(ALL_INACTIVE));
      const scrolled: string[] = [];
      for (const element of screen.getAllByRole('option')) {
        element.scrollIntoView = () => {
          scrolled.push(element.id);
        };
      }
      listbox.focus();

      await userEvent.keyboard('{End}');

      expect(scrolled).toEqual([option('libWrapper').id]);
    });
  });
});
