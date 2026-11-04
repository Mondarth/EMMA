import { describe, expect, test } from 'vitest';

import { defaultCatalogue } from '@module/lib/default-catalogue';
import { obscure } from '@mondarth/emma-core/obscure';

describe('defaultCatalogue', () => {
  test('is none in a build without one, as every test build is', () => {
    expect(defaultCatalogue()).toBeNull();
  });

  test('reveals the catalogue a release was built with', () => {
    const built = { url: obscure('https://catalogue.example.test/'), key: obscure('k3y') };

    expect(defaultCatalogue(built)).toEqual({ url: 'https://catalogue.example.test/', key: 'k3y' });
  });
});
