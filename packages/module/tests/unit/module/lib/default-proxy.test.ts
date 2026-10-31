import { describe, expect, test } from 'vitest';

import { defaultProxy } from '@module/lib/default-proxy';
import { obscure } from '@mondarth/emma-core/obscure';

describe('defaultProxy', () => {
  test('is none in a build without one, as every test build is', () => {
    expect(defaultProxy()).toBeNull();
  });

  test('reveals the proxy a release was built with', () => {
    const built = { url: obscure('https://packages.example.test/?url={url}'), key: obscure('k3y') };

    expect(defaultProxy(built)).toEqual({ url: 'https://packages.example.test/?url={url}', key: 'k3y' });
  });
});
