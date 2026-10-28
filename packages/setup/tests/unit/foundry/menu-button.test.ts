import { afterEach, describe, expect, test, vi } from 'vitest';

import { addButton, keepMenuButton, MENU_BUTTON_CLASS } from '../../../src/foundry/menu-button';
import { installSetupMocks } from '../../mocks/foundry';

/**
 * The setup screen's menu, as Foundry renders it.
 * @returns Its element
 */
function menu(): HTMLElement {
  const element = document.createElement('nav');
  element.id = 'setup-menu';
  element.innerHTML =
    '<div data-application-part="buttons"><button type="button" class="icon" data-action="configure"></button></div>';
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('addButton', () => {
  test("puts EMMA's button first in the menu, once", () => {
    const element = menu();
    const onClick = vi.fn();

    addButton(element, { label: 'EMMA', onClick });
    addButton(element, { label: 'EMMA', onClick });
    const buttons = element.querySelectorAll('button');
    buttons[0]?.click();

    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveClass(MENU_BUTTON_CLASS);
    expect(buttons[0]).toHaveAccessibleName('EMMA');
    expect(buttons[0]).toHaveAttribute('data-tooltip', 'EMMA');
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('does nothing in a menu without its buttons part', () => {
    const element = document.createElement('nav');

    addButton(element, { label: 'EMMA', onClick: vi.fn() });

    expect(element.children).toHaveLength(0);
  });
});

describe('keepMenuButton', () => {
  test('adds the button to the menu showing, and again each time it renders', () => {
    const { Hooks } = installSetupMocks();
    const showing = menu();
    document.body.append(showing);

    keepMenuButton({ label: 'EMMA', onClick: vi.fn() });
    const rendered = menu();
    Hooks.run('renderSetupMenu', {}, rendered);

    expect(showing.querySelector(`.${MENU_BUTTON_CLASS}`)).not.toBeNull();
    expect(rendered.querySelector(`.${MENU_BUTTON_CLASS}`)).not.toBeNull();
  });

  test('waits for the menu if it is not showing yet', () => {
    const { Hooks } = installSetupMocks();

    keepMenuButton({ label: 'EMMA', onClick: vi.fn() });

    expect(Hooks.on).toHaveBeenCalledWith('renderSetupMenu', expect.any(Function));
  });
});
