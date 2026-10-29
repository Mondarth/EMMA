import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { packageFolders, PACKAGES_FOLDER } from '../src/workspace.ts';

/** The repository's root. */
const REPOSITORY = path.resolve(import.meta.dirname, '../../..');

describe('packageFolders', () => {
  let root: string;

  /**
   * Write a package of the workspace.
   * @param folder - Its folder in `packages/`
   * @param manifest - Its `package.json`
   */
  function writePackage(folder: string, manifest: Record<string, unknown>): void {
    fs.mkdirSync(path.join(root, 'packages', folder), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', folder, 'package.json'), JSON.stringify(manifest));
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-release-'));
    writePackage('a', { name: 'a', dependencies: { b: 'workspace:*', lodash: '^4.0.0' } });
    writePackage('b', { name: 'b', devDependencies: { c: 'workspace:^' } });
    writePackage('c', { name: 'c', peerDependencies: { a: 'workspace:*' } });
    writePackage('d', { name: 'd', optionalDependencies: { c: 'workspace:~' } });
    writePackage('nameless', {});
    fs.mkdirSync(path.join(root, 'packages/no-manifest'));
    fs.writeFileSync(path.join(root, 'packages/README.md'), 'Not a package');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('gives the package its own folder and those of its workspace dependencies, through each other', () => {
    expect(packageFolders(root, 'packages/a')).toEqual(['packages/a', 'packages/b', 'packages/c']);
  });

  test('counts every kind of dependency', () => {
    expect(packageFolders(root, 'packages/d')).toEqual(['packages/a', 'packages/b', 'packages/c', 'packages/d']);
  });

  test('refuses a folder that holds no package', () => {
    expect(() => packageFolders(root, 'packages/no-manifest')).toThrow('packages/no-manifest holds no package');
  });

  test('refuses a dependency the workspace does not have', () => {
    writePackage('e', { name: 'e', dependencies: { missing: 'workspace:*' } });

    expect(() => packageFolders(root, 'packages/e')).toThrow('packages/e depends on missing, which is not a package');
  });
});

describe("the repository's workspace", () => {
  test('holds its packages in packages/, as packageFolders reads it', () => {
    const workspace = fs.readFileSync(path.join(REPOSITORY, 'pnpm-workspace.yaml'), 'utf8');
    const listed = /^packages:\n((?:\s+-.*\n)+)/m.exec(workspace)?.[1];

    expect(listed?.trim().split('\n')).toEqual([`  - ${PACKAGES_FOLDER}/*`.trim()]);
  });

  test("releases the module from its folder and the shared code's", () => {
    expect(packageFolders(REPOSITORY, 'packages/module')).toEqual(['packages/core', 'packages/module']);
  });

  test("releases the extension from its folder, the setup screen's and the shared code's", () => {
    expect(packageFolders(REPOSITORY, 'packages/extension')).toEqual([
      'packages/core',
      'packages/extension',
      'packages/setup',
    ]);
  });
});
