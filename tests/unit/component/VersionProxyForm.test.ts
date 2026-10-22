import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import VersionProxyForm from '@component/VersionProxyForm.svelte';
import { VersionProxyDraft } from '@module/state/version-proxy.svelte';
import { installFoundryMocks } from '../mocks/foundry';

const SAVE = 'MONDARTH-EMMA.Settings.VersionProxy.Save';
const PROXY = 'https://proxy.test/?url={url}';
const MODES = 'MONDARTH-EMMA.Settings.VersionProxy.Modes';

describe('VersionProxyForm', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('offers EMMA’s proxy, the GM’s own, or none, each described', () => {
    render(VersionProxyForm, { draft: new VersionProxyDraft('default', '', ''), hasDefault: true, onSave: vi.fn() });

    const choice = screen.getByRole('radiogroup', { name: 'MONDARTH-EMMA.Settings.VersionProxy.Choice' });
    expect(choice).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map(radio => radio.getAttribute('value'))).toEqual(['default', 'own', 'none']);
    expect(screen.getByRole('radio', { name: `${MODES}.Default` })).toBeChecked();
    expect(screen.getByRole('radio', { name: `${MODES}.Default` })).toHaveAccessibleDescription(`${MODES}.DefaultHint`);
    expect(screen.getByRole('radio', { name: `${MODES}.None` })).toHaveAccessibleDescription(`${MODES}.NoneHint`);
  });

  test('offers only the GM’s own proxy or none in a build without EMMA’s', () => {
    render(VersionProxyForm, { draft: new VersionProxyDraft('none', '', ''), hasDefault: false, onSave: vi.fn() });

    expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('value'))).toEqual(['own', 'none']);
  });

  test('asks for the URL and key only for the GM’s own proxy, and never shows EMMA’s', async () => {
    render(VersionProxyForm, {
      draft: new VersionProxyDraft('default', PROXY, 'k3y'),
      hasDefault: true,
      onSave: vi.fn(),
    });
    expect(screen.queryByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Url')).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.Own` }));

    const url = screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Url');
    expect(url).toHaveValue(PROXY);
    expect(url).toHaveAccessibleDescription('MONDARTH-EMMA.Settings.VersionProxy.UrlHint');
    expect(url).toHaveAttribute('aria-invalid', 'false');
    const key = screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Key');
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('autocomplete', 'off');
  });

  test('saves the choice, with the proxy and key typed, recording them in its draft', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    const draft = new VersionProxyDraft('default', '', '');
    render(VersionProxyForm, { draft, hasDefault: true, onSave });

    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.Own` }));
    // user-event reads `{` as the start of a key's name; `{{` types one.
    await userEvent.type(screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Url'), PROXY.replace('{', '{{'));
    await userEvent.type(screen.getByLabelText('MONDARTH-EMMA.Settings.VersionProxy.Key'), 'k3y');
    expect(draft.dirty).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith('own', PROXY, 'k3y');
  });

  test('saves no proxy, keeping the GM’s own for another time', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(VersionProxyForm, { draft: new VersionProxyDraft('own', PROXY, 'k3y'), hasDefault: true, onSave });

    await userEvent.click(screen.getByRole('radio', { name: `${MODES}.None` }));
    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith('none', PROXY, 'k3y');
  });

  test('never saves the GM’s own proxy without {url}, however the form is submitted', () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(VersionProxyForm, {
      draft: new VersionProxyDraft('own', 'https://proxy.test/', ''),
      hasDefault: true,
      onSave,
    });

    expect(screen.getByRole('alert')).toHaveTextContent('MONDARTH-EMMA.Settings.VersionProxy.Invalid');
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
    render(VersionProxyForm, { draft: new VersionProxyDraft('default', '', ''), hasDefault: true, onSave });
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
    render(VersionProxyForm, { draft: new VersionProxyDraft('default', '', ''), hasDefault: true, onSave });

    await userEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(await screen.findByRole('button', { name: SAVE })).toBeEnabled();
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to save the version lookup proxy', failure);
  });
});
