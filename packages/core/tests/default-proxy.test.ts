import { describe, expect, test } from 'vitest';

import { revealProxy } from '../src/default-proxy';
import { obscure } from '../src/obscure';

describe('revealProxy', () => {
  test('is none for a build without one', () => {
    expect(revealProxy(null)).toBeNull();
  });

  test('reveals the proxy a release was built with', () => {
    const built = { url: obscure('https://packages.example.test/?url={url}'), key: obscure('k3y') };

    expect(revealProxy(built)).toEqual({ url: 'https://packages.example.test/?url={url}', key: 'k3y' });
  });
});
