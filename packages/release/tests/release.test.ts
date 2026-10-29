import path from 'node:path';
import { Writable } from 'node:stream';

import type { Options, Result } from 'semantic-release';
import semanticRelease from 'semantic-release';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { onlyCommitsTo } from '../src/plugins.ts';
import { packageFolders } from '../src/workspace.ts';
import type { Repository } from './repository.ts';
import { makeRepository } from './repository.ts';

/**
 * A stream for semantic-release's log, which the tests leave unread.
 * @returns The stream: semantic-release types it as a terminal's, but only writes to it
 */
function quiet(): NodeJS.WriteStream {
  const stream = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  return stream as NodeJS.WriteStream;
}

describe('a release with onlyCommitsTo', () => {
  let repository: Repository;
  let remote: Repository;

  beforeEach(() => {
    remote = makeRepository();
    remote.git('init', '--quiet', '--bare', '--initial-branch=main', 'remote.git');
    repository = makeRepository();
    repository.commit('chore(repo): start', {
      'packages/core/package.json': JSON.stringify({ name: 'core' }),
      'packages/module/package.json': JSON.stringify({ name: 'module', dependencies: { core: 'workspace:*' } }),
      'packages/extension/package.json': JSON.stringify({ name: 'extension', dependencies: { core: 'workspace:*' } }),
    });
    repository.git('tag', 'v0.9.0');
    repository.git('remote', 'add', 'origin', `file://${path.join(remote.root, 'remote.git')}`);
  });

  afterEach(() => {
    repository.remove();
    remote.remove();
  });

  /**
   * Push `main` and work out the module's next release, as a dry run, from the commits that change it.
   * @returns What semantic-release found: `false` if nothing is to be released
   */
  async function releaseModule(): Promise<Result> {
    repository.git('push', '--quiet', '--tags', 'origin', 'main');
    const folders = packageFolders(repository.root, 'packages/module');
    return semanticRelease(
      {
        branches: ['main'],
        repositoryUrl: `file://${path.join(remote.root, 'remote.git')}`,
        tagFormat: 'v${version}',
        ci: false,
        dryRun: true,
        // semantic-release takes inline plugins (see its lib/plugins/utils.js), which its types leave out.
        plugins: [
          await onlyCommitsTo(folders, '@semantic-release/commit-analyzer'),
          await onlyCommitsTo(folders, '@semantic-release/release-notes-generator'),
        ] as unknown as Options['plugins'],
      },
      // No CI's variables, so that semantic-release reads the branch from the repository, wherever the tests run.
      {
        cwd: repository.root,
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
        stdout: quiet(),
        stderr: quiet(),
      },
    );
  }

  test("releases nothing for another package's commits", async () => {
    repository.commit('fix(extension): only the extension', { 'packages/extension/index.ts': '1' });

    expect(await releaseModule()).toBe(false);
  });

  test("releases the package for its dependencies' commits, and notes only its own", async () => {
    repository.commit('fix(extension): only the extension', { 'packages/extension/index.ts': '1' });
    repository.commit('fix(core): the shared code', { 'packages/core/index.ts': '1' });
    repository.commit('feat(module): the module', { 'packages/module/index.ts': '1' });

    const result = await releaseModule();

    expect(result && result.nextRelease.version).toBe('0.10.0');
    expect(result && result.nextRelease.gitTag).toBe('v0.10.0');
    expect(result && result.nextRelease.notes).toContain('the shared code');
    expect(result && result.nextRelease.notes).not.toContain('only the extension');
  });
});
