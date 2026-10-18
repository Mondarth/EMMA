import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import Footer from '@component/Footer.svelte';
import type { ModuleEntry } from '@module/adapters/modules';
import { ModuleState } from '@module/state/module-state.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';
import { moduleEntry } from '../mocks/entries';

const SAVE = 'MONDARTH-EMMA.Footer.Save';
const RESET = 'MONDARTH-EMMA.Footer.Reset';

describe('Footer', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  describe('for a GM', () => {
    test('offers Reset and Save, disabled while nothing is staged', () => {
      render(Footer, { modules: createModules(), canManage: true, onSave: vi.fn() });

      expect(screen.getByRole('button', { name: RESET })).toBeDisabled();
      expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    test('enables both and counts the changes once some are staged', async () => {
      const modules = createModules();
      render(Footer, { modules, canManage: true, onSave: vi.fn() });

      modules.setActive('emma', true);
      modules.setActive('dice', true);

      expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
      expect(screen.getByRole('button', { name: RESET })).toBeEnabled();
      expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Footer.Changes {"count":"2"}');
    });

    test('Reset discards the staged changes', async () => {
      const modules = createModules();
      modules.setActive('emma', true);
      render(Footer, { modules, canManage: true, onSave: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: RESET }));

      expect(modules.dirty).toBe(false);
      expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
    });

    test('Save saves, with both buttons disabled until it finishes', async () => {
      const modules = createModules();
      modules.setActive('emma', true);
      let finish: () => void = () => undefined;
      const onSave = vi.fn(
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          }),
      );
      render(Footer, { modules, canManage: true, onSave });

      await userEvent.click(screen.getByRole('button', { name: SAVE }));

      expect(onSave).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
      expect(screen.getByRole('button', { name: RESET })).toBeDisabled();

      finish();

      expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
    });

    test('logs a save that throws, and re-enables Save', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const modules = createModules();
      modules.setActive('emma', true);
      const failure = new Error('failed');
      render(Footer, { modules, canManage: true, onSave: vi.fn(() => Promise.reject(failure)) });

      await userEvent.click(screen.getByRole('button', { name: SAVE }));

      expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
      expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to save', failure);
    });

    test('blocks Save, naming what is missing, while a requirement is unmet', () => {
      const entries: ModuleEntry[] = [
        moduleEntry({ id: 'app', title: 'App', requires: ['lib', 'gone'] }),
        moduleEntry({ id: 'lib', title: 'Library' }),
      ];
      const modules = new ModuleState(entries, {});
      // Activating App activates Library with it; the module that is not installed stays missing.
      modules.setActive('app', true);
      render(Footer, { modules, canManage: true, onSave: vi.fn() });

      expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
      expect(screen.getByRole('button', { name: RESET })).toBeEnabled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'MONDARTH-EMMA.Requirements.Unmet {"module":"App","missing":"gone"}',
      );
    });
  });

  test('updates the status as changes are staged and requirements met', async () => {
    const entries: ModuleEntry[] = [
      moduleEntry({ id: 'app', title: 'App', requires: ['lib'] }),
      moduleEntry({ id: 'lib', title: 'Library' }),
    ];
    // Saved with App active and Library not, so its requirement is unmet until Library is activated.
    const modules = new ModuleState(entries, { app: true });
    render(Footer, { modules, canManage: true, onSave: vi.fn() });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('MONDARTH-EMMA.Requirements.Unmet');

    modules.setActive('lib', true);
    await vi.waitFor(() => {
      expect(status).toHaveTextContent('MONDARTH-EMMA.Footer.Changes');
    });

    modules.reset();
    await vi.waitFor(() => {
      expect(status).toHaveTextContent('MONDARTH-EMMA.Requirements.Unmet');
    });
  });

  describe('for a user who may not manage modules', () => {
    test('says the window is read-only and offers no buttons', () => {
      render(Footer, { modules: createModules(), canManage: false, onSave: vi.fn() });

      expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Footer.ReadOnly');
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});
