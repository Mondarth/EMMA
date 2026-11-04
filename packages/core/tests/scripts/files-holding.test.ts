import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { filesHolding } from '../../scripts/files-holding.ts';

const KEY = 'k3y-0123456789abcdef';

describe('filesHolding', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  test('names the built files that hold a secret in plain text, so a release can refuse to ship them', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-dist-'));
    fs.mkdirSync(path.join(dir, 'lang'));
    fs.writeFileSync(path.join(dir, 'mondarth-emma.js'), `const key = "${KEY}";`);
    fs.writeFileSync(path.join(dir, 'mondarth-emma.js.map'), '{"mappings":""}');
    fs.writeFileSync(path.join(dir, 'lang', 'en.json'), `{"leak":"${KEY}"}`);

    expect(
      filesHolding(dir, KEY)
        .map(file => path.relative(dir as string, file))
        .sort(),
    ).toEqual([path.join('lang', 'en.json'), 'mondarth-emma.js']);
    expect(filesHolding(dir, 'not-there')).toEqual([]);
  });
});
