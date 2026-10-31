import { describe, expect, test } from 'vitest';

import { revealCatalogue } from '../src/default-catalogue';
import { obscure } from '../src/obscure';

describe('revealCatalogue', () => {
  test('is none for a build without one', () => {
    expect(revealCatalogue(null)).toBeNull();
  });

  test('reveals the catalogue a release was built with', () => {
    const built = { url: obscure('https://catalogue.example.test/'), key: obscure('k3y') };

    expect(revealCatalogue(built)).toEqual({ url: 'https://catalogue.example.test/', key: 'k3y' });
  });
});
