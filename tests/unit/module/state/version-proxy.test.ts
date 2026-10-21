import { describe, expect, test } from 'vitest';

import { VersionProxyDraft } from '@module/state/version-proxy.svelte';

describe('VersionProxyDraft', () => {
  test('starts with what is set, and unchanged', () => {
    const draft = new VersionProxyDraft('https://proxy.test/?url={url}', 'k3y');

    expect([draft.proxy, draft.key, draft.dirty, draft.valid]).toEqual([
      'https://proxy.test/?url={url}',
      'k3y',
      false,
      true,
    ]);
  });

  test('is changed by a new proxy or key, but not by spaces around them', () => {
    const draft = new VersionProxyDraft('https://proxy.test/?url={url}', 'k3y');

    draft.key = ' k3y ';
    expect(draft.dirty).toBe(false);
    draft.key = 'other';
    expect(draft.dirty).toBe(true);
    draft.key = 'k3y';
    draft.proxy = 'https://other.test/?u={url}';
    expect(draft.dirty).toBe(true);
  });

  test('accepts no proxy, or one with {url}, but not one without', () => {
    const draft = new VersionProxyDraft('', '');

    expect(draft.valid).toBe(true);
    draft.proxy = 'https://proxy.test/';
    expect(draft.valid).toBe(false);
    draft.proxy = ' https://proxy.test/{url} ';
    expect(draft.valid).toBe(true);
  });
});
