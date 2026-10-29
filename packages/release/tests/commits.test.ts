import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { changedFiles, checkFolder, isIn } from '../src/commits.ts';
import type { Repository } from './repository.ts';
import { makeRepository } from './repository.ts';

describe('changedFiles', () => {
  let repository: Repository;

  beforeEach(() => {
    repository = makeRepository();
  });

  afterEach(() => {
    repository.remove();
  });

  test('gives the first commit its files', async () => {
    const first = repository.commit('chore(repo): start', { 'README.md': 'EMMA', 'packages/a/index.ts': 'a' });

    expect(await changedFiles(repository.root, [first])).toEqual(
      new Map([[first, ['README.md', 'packages/a/index.ts']]]),
    );
  });

  test('gives each commit the files it changes', async () => {
    repository.commit('chore(repo): start', { 'packages/a/index.ts': 'a' });
    const a = repository.commit('fix(a): one', { 'packages/a/index.ts': 'a2' });
    const b = repository.commit('fix(b): two', { 'packages/b/index.ts': 'b', 'packages/b/naïve file.ts': 'b' });

    expect(await changedFiles(repository.root, [b, a])).toEqual(
      new Map([
        [b, ['packages/b/index.ts', 'packages/b/naïve file.ts']],
        [a, ['packages/a/index.ts']],
      ]),
    );
  });

  test('gives a merge commit, and one that changes nothing, no files', async () => {
    repository.commit('chore(repo): start', { 'packages/a/index.ts': 'a' });
    repository.git('switch', '--quiet', '--create', 'topic');
    const topic = repository.commit('fix(b): on a branch', { 'packages/b/index.ts': 'b' });
    repository.git('switch', '--quiet', 'main');
    repository.git('merge', '--quiet', '--no-ff', '--message', 'Merge branch topic', 'topic');
    const merge = repository.git('rev-parse', 'HEAD');
    const empty = repository.commit('chore(repo): nothing');

    expect(await changedFiles(repository.root, [empty, merge, topic])).toEqual(
      new Map([
        [empty, []],
        [merge, []],
        [topic, ['packages/b/index.ts']],
      ]),
    );
  });

  test('runs nothing for no commits', async () => {
    expect(await changedFiles('/no/such/folder', [])).toEqual(new Map());
  });
});

describe('checkFolder', () => {
  test('takes a folder named from the root', () => {
    expect(checkFolder('packages/module')).toBe('packages/module');
  });

  test.each(['', '.', '..', '../other', '/packages/module', 'packages/module/', './packages/module', 'packages//a'])(
    'refuses %j',
    folder => {
      expect(() => checkFolder(folder)).toThrow(/is not a folder named from the repository's root/);
    },
  );
});

describe('isIn', () => {
  test('finds a file at any depth of a folder', () => {
    expect(isIn('packages/module/src/index.ts', ['packages/core', 'packages/module'])).toBe(true);
  });

  test('does not take a folder for one whose name it begins', () => {
    expect(isIn('packages/module-two/index.ts', ['packages/module'])).toBe(false);
  });

  test('does not take the folder itself, or files outside it', () => {
    expect(isIn('packages/module', ['packages/module'])).toBe(false);
    expect(isIn('README.md', ['packages/module'])).toBe(false);
  });
});
