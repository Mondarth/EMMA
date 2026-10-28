import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { SETUP_PAGE_MESSAGE } from '../../../src/browser/api';

describe('the loader', () => {
  test('sends the message the background listens for', () => {
    const loader = fs.readFileSync(path.resolve(import.meta.dirname, '../../../src/loader.ts'), 'utf8');

    expect(loader).toContain(`const MESSAGE = '${SETUP_PAGE_MESSAGE}';`);
  });
});
