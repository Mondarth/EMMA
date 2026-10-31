// @vitest-environment node
/**
 * The dev server's settings, read from `.pdt/mount.json`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { DEFAULT_FILE, DEFAULTS, readDevServer } from '../../../scripts/dev/dev-server';

/** The repositories a test made, removed after it. */
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A repository's root, with a settings file.
 * @param text - What the file holds, if there is one
 * @param file - Where it is, from the root
 * @returns The root
 */
function repository(text?: string, file = DEFAULT_FILE): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-setup-dev-'));
  roots.push(root);
  if (text !== undefined) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe("the dev server's settings", () => {
  test('are the defaults without a file', () => {
    expect(readDevServer(repository(), {})).toEqual(DEFAULTS);
  });

  test("take what the file gives, as the module's dev server reads it", () => {
    const root = repository(JSON.stringify({ hostname: 'box', ports: { base: 30010, dev: 31002, setup: 31020 } }));

    expect(readDevServer(root, {})).toEqual({ hostname: 'box', foundry: 30010, port: 31020 });
  });

  test('keep the defaults for what the file leaves out', () => {
    expect(readDevServer(repository('{"ports":{}}'), {})).toEqual(DEFAULTS);
  });

  test('come from the file PDT_MOUNT_CONFIG names', () => {
    const root = repository('{"hostname":"other"}', 'elsewhere.json');

    expect(readDevServer(root, { PDT_MOUNT_CONFIG: 'elsewhere.json' }).hostname).toBe('other');
    expect(() => readDevServer(root, { PDT_MOUNT_CONFIG: 'missing.json' })).toThrow(/names a missing file/);
  });

  test('refuse a file that is not JSON, or not settings', () => {
    expect(() => readDevServer(repository('{'), {})).toThrow(/Unable to parse/);
    expect(() => readDevServer(repository('{"ports":{"setup":0}}'), {})).toThrow(/Invalid dev server settings/);
  });
});
