import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import VersionPicker from '../../../src/component/VersionPicker.svelte';
import type { VersionOption } from '../../../src/lib/updates';

const CHOOSE = 'Version of Dice: 2.0.0';

/**
 * A version and its badge.
 * @param version - The version
 * @param type - The badge's colour
 * @returns The option
 */
function option(version: string, type: 'success' | 'error' = 'success'): VersionOption {
  return { version, badge: { type, icon: 'fa-solid fa-code-branch', tooltip: type, text: type } };
}

const OPTIONS = [option('3.0.0', 'error'), option('2.0.0'), option('1.0.0')];

/**
 * Render the picker on version 2.0.0 of three, 1.0.0 installed.
 * @returns Its spies
 */
function renderPicker() {
  const onChoose = vi.fn();
  const versions = vi.fn(() => OPTIONS);
  render(VersionPicker, { title: 'Dice', chosen: option('2.0.0'), versions, installed: '1.0.0', onChoose });
  return { onChoose, versions };
}

describe('VersionPicker', () => {
  test('shows the chosen version as its badge, on a button that opens a list of the others, judged then', async () => {
    const { versions } = renderPicker();
    const button = screen.getByRole('button', { name: CHOOSE });
    expect(button).toHaveAttribute('aria-haspopup', 'listbox');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.querySelector('.emma-badge.success')).toHaveTextContent('2.0.0');
    expect(versions).not.toHaveBeenCalled();

    await userEvent.click(button);

    expect(versions).toHaveBeenCalledOnce();
    const listbox = screen.getByRole('listbox', { name: 'Versions of Dice' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options.map(item => item.textContent.trim().split(/\s+/)[0])).toEqual(['3.0.0', '1.0.0']);
    expect(options[0]?.querySelector('.emma-badge')).toHaveClass('error');
    // The installed version is marked so.
    expect(options[0]).not.toHaveTextContent('Installed');
    expect(options[1]).toHaveTextContent('Installed');
    expect(listbox).toHaveFocus();
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  test('chooses a version clicked, and closes; or closes when its button is clicked again', async () => {
    const { onChoose } = renderPicker();
    const button = screen.getByRole('button', { name: CHOOSE });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    await userEvent.click(screen.getAllByRole('option')[1] as HTMLElement);

    expect(onChoose).toHaveBeenCalledExactlyOnceWith('1.0.0');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('is driven from the keyboard', async () => {
    const { onChoose } = renderPicker();
    screen.getByRole('button', { name: CHOOSE }).focus();
    await userEvent.keyboard('{Enter}');
    const listbox = screen.getByRole('listbox');
    const options = screen.getAllByRole('option');

    await userEvent.keyboard('{ArrowUp}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0]?.id);
    await userEvent.keyboard('{End}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options[1]?.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options[1]?.id);
    await userEvent.keyboard('{Home}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0]?.id);
    await userEvent.keyboard('x');
    expect(onChoose).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowDown} ');

    expect(onChoose).toHaveBeenCalledExactlyOnceWith('1.0.0');
    expect(screen.getByRole('button', { name: CHOOSE })).toHaveFocus();
  });

  test('closes on Escape, back on its button, or when Tab moves the keyboard on, without a choice', async () => {
    const { onChoose } = renderPicker();
    const button = screen.getByRole('button', { name: CHOOSE });
    await userEvent.click(button);
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();

    await userEvent.click(button);
    await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(onChoose).not.toHaveBeenCalled();
  });

  test('marks the version under the pointer', async () => {
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));
    const options = screen.getAllByRole('option');

    await fireEvent.pointerMove(options[1] as HTMLElement);

    expect(options[1]).toHaveClass('active');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-activedescendant', options[1]?.id);
  });
});
