import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import VersionProxyForm from '@component/VersionProxyForm.svelte';
import { VersionProxyDraft } from '@module/state/version-proxy.svelte';
import { installFoundryMocks } from '../mocks/foundry';

const SAVE = 'MONDARTH-EMMA.Settings.VersionProxy.Save';
const PROXY = 'https://proxy.test/?url={url}';

describe('VersionProxyForm', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('labels and describes both fields', () => {
    render(VersionProxyForm, { draft: new VersionProxyDraft(PROXY, 'k3y'), onSave: vi.fn() });

    const url = screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Url');
    expect(url).toHaveValue(PROXY);
    expect(url).toHaveAccessibleDescription('MONDARTH-EMMA.Settings.VersionProxy.UrlHint');
    expect(url).toHaveAttribute('aria-invalid', 'false');
    const key = screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Key');
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('autocomplete', 'off');
  });

  test('saves the proxy and key typed, recording them in its draft', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    const draft = new VersionProxyDraft('', '');
    render(VersionProxyForm, { draft, onSave });

    await userEvent.type(screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Key'), 'k3y');
    expect(draft.dirty).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith('', 'k3y');
  });

  test('never saves a proxy without {url}, however the form is submitted', () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(VersionProxyForm, { draft: new VersionProxyDraft('https://proxy.test/', ''), onSave });

    expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
    screen.getByRole('button', { name: SAVE }).closest('form')?.requestSubmit();

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
    render(VersionProxyForm, { draft: new VersionProxyDraft('', ''), onSave });
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
    render(VersionProxyForm, { draft: new VersionProxyDraft('', ''), onSave });

    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to save the version lookup proxy', failure);
  });
});
