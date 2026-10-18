import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import DrawerFieldsForm from '@component/DrawerFieldsForm.svelte';
import { DRAWER_FIELDS } from '@module/state/drawer-fields.svelte';
import { installFoundryMocks } from '../mocks/foundry';

const SAVE = 'MONDARTH-EMMA.Settings.Fields.Save';
const DEFAULTS = 'MONDARTH-EMMA.Settings.Fields.Defaults';

/**
 * The checkbox for a field.
 * @param field - The field
 * @returns The checkbox
 */
function checkbox(field: string): HTMLElement {
  return screen.getByRole('checkbox', { name: `MONDARTH-EMMA.Drawer.Field.${field}` });
}

describe('DrawerFieldsForm', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('has a checkbox for every field, in drawer order, checked for those shown now', () => {
    render(DrawerFieldsForm, { initial: ['links', 'id'], onSave: vi.fn() });

    const group = screen.getByRole('group', { name: 'MONDARTH-EMMA.Settings.Fields.Legend' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').map(box => box.closest('label')?.textContent.trim())).toEqual(
      DRAWER_FIELDS.map(field => `MONDARTH-EMMA.Drawer.Field.${field}`),
    );
    expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([checkbox('links'), checkbox('id')]);
  });

  test('saves the fields checked, in drawer order', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(DrawerFieldsForm, { initial: ['description'], onSave });

    await userEvent.click(checkbox('id'));
    await userEvent.click(checkbox('description'));
    await userEvent.click(checkbox('packs'));
    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith(['packs', 'id']);
  });

  test('checks the defaults again without saving them', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(DrawerFieldsForm, { initial: ['id'], onSave });

    await userEvent.click(screen.getByRole('button', { name: DEFAULTS }));

    expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([
      checkbox('description'),
      checkbox('authors'),
      checkbox('languages'),
    ]);
    expect(onSave).not.toHaveBeenCalled();
  });

  test('disables Save while saving, and only saves once', async () => {
    let finish = (): void => undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    render(DrawerFieldsForm, { initial: [], onSave });
    const save = screen.getByRole('button', { name: SAVE });

    await userEvent.click(save);
    expect(save).toBeDisabled();
    save.closest('form')?.requestSubmit();

    finish();
    expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
    expect(onSave).toHaveBeenCalledOnce();
  });

  test('logs anything saving throws, and can be saved again', async () => {
    const failure = new Error('offline');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSave = vi.fn(() => Promise.reject(failure));
    render(DrawerFieldsForm, { initial: [], onSave });

    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to save the drawer fields', failure);
  });
});
