import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import TransferControls from '@component/TransferControls.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';

const ACTIVATE = 'MONDARTH-EMMA.Split.Activate';
const DEACTIVATE = 'MONDARTH-EMMA.Split.Deactivate';

describe('TransferControls', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('offers < to deactivate, then > to activate, as icon buttons with tooltips', () => {
    render(TransferControls, { modules: createModules() });

    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAccessibleName(DEACTIVATE);
    expect(first).toHaveClass('icon', 'fa-solid', 'fa-angle-left');
    expect(first).toHaveAttribute('data-tooltip', DEACTIVATE);
    expect(second).toHaveAccessibleName(ACTIVATE);
    expect(second).toHaveClass('icon', 'fa-solid', 'fa-angle-right');
  });

  test('disables both buttons while nothing is selected', () => {
    render(TransferControls, { modules: createModules() });

    expect(screen.getByRole('button', { name: ACTIVATE })).toBeDisabled();
    expect(screen.getByRole('button', { name: DEACTIVATE })).toBeDisabled();
  });

  test('enables each button once its side has a selection', async () => {
    const modules = createModules();
    render(TransferControls, { modules });

    modules.select('inactive', 'emma');

    expect(await screen.findByRole('button', { name: ACTIVATE })).toBeEnabled();
    expect(screen.getByRole('button', { name: DEACTIVATE })).toBeDisabled();
  });

  test('> activates the selected inactive modules', async () => {
    const modules = createModules();
    modules.select('inactive', 'emma');
    render(TransferControls, { modules });

    await userEvent.click(screen.getByRole('button', { name: ACTIVATE }));

    expect(modules.changes).toEqual({ emma: true });
    // The moved module is now selected on the active side, so < can undo the move.
    expect(screen.getByRole('button', { name: DEACTIVATE })).toBeEnabled();
    expect(screen.getByRole('button', { name: ACTIVATE })).toBeDisabled();
  });

  test('< deactivates the selected active modules', async () => {
    const modules = createModules();
    modules.select('active', 'lib-wrapper');
    render(TransferControls, { modules });

    await userEvent.click(screen.getByRole('button', { name: DEACTIVATE }));

    expect(modules.changes).toEqual({ 'lib-wrapper': false });
  });
});
