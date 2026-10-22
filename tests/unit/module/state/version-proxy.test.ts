import { describe, expect, test } from 'vitest';

import { VersionProxyDraft } from '@module/state/version-proxy.svelte';

describe('VersionProxyDraft', () => {
  test('starts with what is set, and unchanged', () => {
    const draft = new VersionProxyDraft('own', 'https://proxy.test/?url={url}', 'k3y');

    expect([draft.mode, draft.proxy, draft.key, draft.dirty, draft.valid]).toEqual([
      'own',
      'https://proxy.test/?url={url}',
      'k3y',
      false,
      true,
    ]);
  });

  test('is changed by another choice, or a new proxy or key, but not by spaces around them', () => {
    const draft = new VersionProxyDraft('own', 'https://proxy.test/?url={url}', 'k3y');

    draft.key = ' k3y ';
    expect(draft.dirty).toBe(false);
    draft.key = 'other';
    expect(draft.dirty).toBe(true);
    draft.key = 'k3y';
    draft.proxy = 'https://other.test/?u={url}';
    expect(draft.dirty).toBe(true);
    draft.proxy = 'https://proxy.test/?url={url}';
    draft.mode = 'none';
    expect(draft.dirty).toBe(true);
  });

  test('needs the GM’s own proxy to have {url}, and to be there at all', () => {
    const draft = new VersionProxyDraft('own', '', '');

    expect(draft.valid).toBe(false);
    draft.proxy = 'https://proxy.test/';
    expect(draft.valid).toBe(false);
    draft.proxy = ' https://proxy.test/{url} ';
    expect(draft.valid).toBe(true);
  });

  test('keeps the GM’s own proxy, unchecked, while another is chosen', () => {
    const draft = new VersionProxyDraft('default', 'https://proxy.test/', '');

    expect(draft.valid).toBe(true);
    draft.mode = 'none';
    expect(draft.valid).toBe(true);
    expect(draft.proxy).toBe('https://proxy.test/');
  });
});
