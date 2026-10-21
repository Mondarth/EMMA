import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { VersionOption } from '@module/adapters/versions';
import VersionPicker from '@component/VersionPicker.svelte';
import { installFoundryMocks } from '../mocks/foundry';

const CHOOSE = 'MONDARTH-EMMA.Versions.Choose {"module":"Dice","version":"2.0.0"}';
const LIST = 'MONDARTH-EMMA.Versions.List {"module":"Dice"}';

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
 * Render the picker on version 2.0.0 of three.
 * @param props - Props to change
 * @param props.focusable - Whether Tab stops on the button
 * @returns Its spies, with the render result
 */
function renderPicker(props: { focusable?: boolean } = {}) {
  const onChoose = vi.fn();
  const versions = vi.fn(() => OPTIONS);
  const result = render(VersionPicker, { title: 'Dice', chosen: option('2.0.0'), versions, onChoose, ...props });
  return { onChoose, versions, ...result };
}

describe('VersionPicker', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('shows the chosen version as its badge, on a button that opens a list', () => {
    renderPicker();

    const button = screen.getByRole('button', { name: CHOOSE });
    expect(button).toHaveAttribute('aria-haspopup', 'listbox');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.querySelector('.emma-badge.success')).toHaveTextContent('2.0.0');
  });

  test('judges the versions only when the list opens', async () => {
    const { versions } = renderPicker();
    expect(versions).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    expect(versions).toHaveBeenCalledOnce();
  });

  test('lists the other versions, newest first, each in its badge’s colour, leaving out the one shown', async () => {
    renderPicker();

    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    const listbox = screen.getByRole('listbox', { name: LIST });
    expect(screen.getByRole('button', { name: CHOOSE })).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options.map(item => item.textContent.trim().split(/\s+/)[0])).toEqual(['3.0.0', '1.0.0']);
    expect(options[0]?.querySelector('.emma-badge')).toHaveClass('error');
    expect(options[1]?.querySelector('.emma-badge')).toHaveClass('success');
    expect(listbox).toHaveFocus();
    // The keyboard starts on the newest, which is selected as the keyboard moves.
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0]?.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  test('chooses a version clicked, and closes', async () => {
    const { onChoose } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    await userEvent.click(screen.getAllByRole('option')[1] as HTMLElement);

    expect(onChoose).toHaveBeenCalledExactlyOnceWith('1.0.0');
    expect(screen.getByRole('button', { name: CHOOSE })).toHaveAttribute('aria-expanded', 'false');
  });

  test('closes when its button is clicked again', async () => {
    renderPicker();
    const button = screen.getByRole('button', { name: CHOOSE });

    await userEvent.click(button);
    await userEvent.click(button);

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
    await userEvent.keyboard('{ArrowDown} ');

    expect(onChoose).toHaveBeenCalledExactlyOnceWith('1.0.0');
    expect(screen.getByRole('button', { name: CHOOSE })).toHaveFocus();
  });

  test('closes on Escape, back on its button, without a choice', async () => {
    const { onChoose } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    await userEvent.keyboard('{ArrowDown}{Escape}');

    expect(onChoose).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: CHOOSE });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  test('closes when Tab moves the keyboard on', async () => {
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' });

    expect(screen.getByRole('button', { name: CHOOSE })).toHaveAttribute('aria-expanded', 'false');
  });

  test('ignores other keys', async () => {
    const { onChoose } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    await userEvent.keyboard('x');

    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: CHOOSE })).toHaveAttribute('aria-expanded', 'true');
  });

  test('marks the version under the pointer', async () => {
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));
    const options = screen.getAllByRole('option');

    await fireEvent.pointerMove(options[0] as HTMLElement);

    expect(options[0]).toHaveClass('active');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  test('is skipped by Tab where the list handles the keyboard', () => {
    renderPicker({ focusable: false });

    expect(screen.getByRole('button', { name: CHOOSE })).toHaveAttribute('tabindex', '-1');
  });

  test('does not take the keyboard back to an unfocusable button', async () => {
    renderPicker({ focusable: false });
    await userEvent.click(screen.getByRole('button', { name: CHOOSE }));

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: CHOOSE })).not.toHaveFocus();
  });
});
