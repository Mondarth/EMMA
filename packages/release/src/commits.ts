/**
 * Which files of the repository each commit changes, and whether a commit changes a package.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The files each commit changes, as paths from the repository's root, read with one `git diff-tree`.
 *
 * A merge commit, or one that changes nothing, is given no files: what a merge brings in is counted in the commits it
 * merges.
 * @param cwd - A folder in the repository
 * @param hashes - The commits' full hashes
 * @returns The files, by commit hash, for each of the commits
 */
export async function changedFiles(cwd: string, hashes: readonly string[]): Promise<Map<string, string[]>> {
  const files = new Map(hashes.map(hash => [hash, [] as string[]]));
  if (hashes.length === 0) return files;

  // With `-z`, each commit prints its hash and then its files, every one ended by a NUL; one with no files prints
  // nothing. `--root` gives the first commit its files too.
  const diff = run('git', ['diff-tree', '--stdin', '-r', '-z', '--name-only', '--root'], {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  diff.child.stdin?.end(`${hashes.join('\n')}\n`);
  const { stdout } = await diff;

  // A file named exactly as the full hash of one of the commits would be taken for that commit.
  let current: string[] | undefined;
  for (const entry of stdout.split('\0')) {
    const commit = files.get(entry);
    if (commit !== undefined) current = commit;
    else if (entry !== '') current?.push(entry);
  }
  return files;
}

/**
 * Check that a folder is named as `git` names paths: from the repository's root, with `/` and no `.` or `..` parts.
 * @param folder - The folder
 * @returns The folder
 * @throws {Error} When it is not
 */
export function checkFolder(folder: string): string {
  const outside = folder === '..' || folder.startsWith('../');
  if (
    folder === '' ||
    folder === '.' ||
    path.posix.isAbsolute(folder) ||
    outside ||
    folder.endsWith('/') ||
    path.posix.normalize(folder) !== folder
  ) {
    throw new Error(`"${folder}" is not a folder named from the repository's root, such as "packages/module"`);
  }
  return folder;
}

/**
 * Whether a file is in one of the folders.
 * @param file - The file, from the repository's root
 * @param folders - The folders, from the repository's root
 * @returns `true` if it is in one of them, at any depth
 */
export function isIn(file: string, folders: readonly string[]): boolean {
  return folders.some(folder => file.startsWith(`${folder}/`));
}
