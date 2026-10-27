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
      expect(screen.getByRole('status').textContent.trim()).toBe('');
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

  describe('deactivating EMMA itself', () => {
    const WARNING = 'MONDARTH-EMMA.Footer.DisablesEmma';
    const ENTRIES = [moduleEntry({ id: 'mondarth-emma', title: 'EMMA' }), moduleEntry({ id: 'other' })];

    test('warns that saving deactivates EMMA, alongside the count of changes', () => {
      const modules = new ModuleState(ENTRIES, { 'mondarth-emma': true });
      modules.setActive('mondarth-emma', false);
      render(Footer, { modules, canManage: true, onSave: vi.fn() });

      expect(screen.getByRole('status')).toHaveTextContent(WARNING);
      expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Footer.Changes');
    });

    test('does not warn while EMMA stays active, or for a user who cannot save', () => {
      const modules = new ModuleState(ENTRIES, { 'mondarth-emma': true });
      modules.setActive('other', true);
      const { unmount } = render(Footer, { modules, canManage: true, onSave: vi.fn() });
      expect(screen.getByRole('status')).not.toHaveTextContent(WARNING);
      unmount();

      modules.setActive('mondarth-emma', false);
      render(Footer, { modules, canManage: false, onSave: vi.fn() });
      expect(screen.getByRole('status')).not.toHaveTextContent(WARNING);
    });
  });

  describe('with Foundry’s own checks for the badges', () => {
    const NATIVE = 'MONDARTH-EMMA.Footer.NativeBadges';

    test('warns that the badges may be inaccurate', () => {
      render(Footer, { modules: createModules(), canManage: false, onSave: vi.fn(), nativeBadges: true });

      expect(screen.getByRole('status')).toHaveTextContent(NATIVE);
    });

    test('says nothing of them otherwise', () => {
      render(Footer, { modules: createModules(), canManage: false, onSave: vi.fn() });

      expect(screen.getByRole('status')).not.toHaveTextContent(NATIVE);
    });
  });

  describe('hypothetical mode without a proxy', () => {
    const NO_PROXY = 'MONDARTH-EMMA.Footer.NoProxy';

    test('explains what is not looked up, for a GM or not', () => {
      const { unmount } = render(Footer, {
        modules: createModules(),
        canManage: true,
        onSave: vi.fn(),
        unproxied: true,
      });
      expect(screen.getByRole('status')).toHaveTextContent(NO_PROXY);
      unmount();

      render(Footer, { modules: createModules(), canManage: false, onSave: vi.fn(), unproxied: true });
      expect(screen.getByRole('status')).toHaveTextContent(NO_PROXY);
    });

    test('says nothing of it otherwise', () => {
      render(Footer, { modules: createModules(), canManage: true, onSave: vi.fn() });

      expect(screen.getByRole('status')).not.toHaveTextContent(NO_PROXY);
    });
  });

  describe('in hypothetical mode', () => {
    test('saves nothing, however much is staged', () => {
      const modules = createModules();
      modules.setActive('dice', true);
      const onSave = vi.fn();
      render(Footer, { modules, canManage: true, onSave, hypothetical: { canReset: true, reset: vi.fn() } });

      expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
      expect(modules.dirty).toBe(true);
      expect(onSave).not.toHaveBeenCalled();
    });

    test('resets through hypothetical mode, when it says there is something to reset', async () => {
      const modules = createModules();
      modules.setActive('dice', true);
      const reset = vi.fn();
      const { rerender } = render(Footer, {
        modules,
        canManage: true,
        onSave: vi.fn(),
        hypothetical: { canReset: false, reset },
      });
      // Staged before the mode was entered, so not the mode's to reset.
      expect(screen.getByRole('button', { name: RESET })).toBeDisabled();

      await rerender({ hypothetical: { canReset: true, reset } });
      await userEvent.click(screen.getByRole('button', { name: RESET }));

      expect(reset).toHaveBeenCalledOnce();
      // The mode's reset restores what was staged; the footer leaves that to it.
      expect(modules.dirty).toBe(true);
    });
  });
});
