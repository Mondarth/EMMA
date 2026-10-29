/**
 * The workspace's packages, and the folders whose changes make up each package's releases.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The folder that holds the workspace's packages, one in each of its folders, as `pnpm-workspace.yaml` has it. */
export const PACKAGES_FOLDER = 'packages';

/** The kinds of dependency in a package's `package.json`. */
const DEPENDENCY_KINDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

/** What is read of a package's `package.json`. */
type Manifest = { readonly name?: string } & {
  readonly [kind in (typeof DEPENDENCY_KINDS)[number]]?: Readonly<Record<string, string>>;
};

/** A package of the workspace. */
interface WorkspacePackage {
  /** Its folder, from the repository's root, such as `packages/module`. */
  readonly folder: string;
  readonly manifest: Manifest;
}

/**
 * The workspace's packages.
 * @param root - The repository's root
 * @returns The packages, by name
 */
function workspacePackages(root: string): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>();
  for (const entry of fs.readdirSync(path.join(root, PACKAGES_FOLDER), { withFileTypes: true })) {
    const folder = `${PACKAGES_FOLDER}/${entry.name}`;
    const file = path.join(root, folder, 'package.json');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
    if (manifest.name !== undefined) packages.set(manifest.name, { folder, manifest });
  }
  return packages;
}

/**
 * The folders whose changes make up a package's releases: the package's own, and those of the workspace packages it
 * depends on, directly or through others, with the `workspace:` protocol. A package's build takes in what it depends
 * on, so development dependencies count too.
 *
 * Changes elsewhere, such as to the repository's root, belong to no package.
 * @param root - The repository's root
 * @param folder - The package's folder, from the repository's root, such as `packages/module`
 * @returns The folders, from the repository's root, sorted
 * @throws {Error} When the folder holds no workspace package, or the package depends on one the workspace has not
 */
export function packageFolders(root: string, folder: string): string[] {
  const packages = workspacePackages(root);
  const start = [...packages.values()].find(found => found.folder === folder);
  if (start === undefined) throw new Error(`${folder} holds no package of the workspace`);

  const folders = new Set([start.folder]);
  const queue = [start];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const kind of DEPENDENCY_KINDS) {
      for (const [name, range] of Object.entries(next.manifest[kind] ?? {})) {
        if (!range.startsWith('workspace:')) continue;
        const dependency = packages.get(name);
        if (dependency === undefined) {
          throw new Error(`${next.folder} depends on ${name}, which is not a package of the workspace`);
        }
        if (folders.has(dependency.folder)) continue;
        folders.add(dependency.folder);
        queue.push(dependency);
      }
    }
  }
  return [...folders].sort();
}
