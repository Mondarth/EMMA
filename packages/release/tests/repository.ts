/**
 * Throwaway Git repositories for the tests, in the system's temporary folder.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A throwaway repository, on `main`. */
export interface Repository {
  /** Its root. */
  readonly root: string;
  /**
   * Run `git` in it, signing nothing, whatever the user's own Git configuration says.
   * @param args - The arguments
   * @returns What it prints, trimmed
   */
  git(...args: string[]): string;
  /**
   * Write files and commit them.
   * @param message - The commit message
   * @param files - The files' contents, by path from the root
   * @returns The commit's full hash
   */
  commit(message: string, files?: Readonly<Record<string, string>>): string;
  /** Remove it. */
  remove(): void;
}

/**
 * Make a throwaway repository.
 * @returns The repository
 */
export function makeRepository(): Repository {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-release-'));
  const git = (...args: string[]): string =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgsign=false',
        ...args,
      ],
      { cwd: root, encoding: 'utf8' },
    ).trim();

  git('init', '--quiet', '--initial-branch=main');
  return {
    root,
    git,
    commit(message, files = {}) {
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
      }
      git('add', '--all');
      git('commit', '--quiet', '--allow-empty', '--message', message);
      return git('rev-parse', 'HEAD');
    },
    remove() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
