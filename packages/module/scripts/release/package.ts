#!/usr/bin/env node

/**
 * Prepare a release: stamp the version into the manifest and docs, build the bundle and zip the Foundry package.
 *
 * Run by semantic-release (see `release.config.js`) as `node scripts/release/package.ts <version>`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { filesHolding } from '@mondarth/emma-core/files-holding';

/** The module's package, `packages/module`. */
const ROOT = path.resolve(import.meta.dirname, '../..');
/** The repository, which holds the documentation and the files shared by every package. */
const REPOSITORY = path.resolve(ROOT, '../..');
const MANIFEST = path.join(ROOT, 'module.json');
const DOCS_CONF = path.join(REPOSITORY, 'docs/conf.py');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');

/**
 * Where Foundry finds the latest manifest, so installed copies keep finding updates: the manifest committed to `main`,
 * which the release commit updates. It does not depend on which GitHub release is the latest, which may not be the
 * module's once the repository releases other packages, and it is on GitHub, where the resolver finds the module's
 * releases from it. Each release keeps its own manifest too, at `releases/download/v<version>/module.json`.
 */
const STABLE_MANIFEST = 'https://raw.githubusercontent.com/Mondarth/EMMA/main/packages/module/module.json';

/** Files and directories of the module's package shipped in the Foundry package, when present. */
const PACKAGE_CONTENTS = ['module.json', 'dist', 'packs'];

/** Files of the repository shipped in the Foundry package, at its root, when present. */
const REPOSITORY_CONTENTS = ['LICENSE', 'README.md', 'CHANGELOG.md'];

interface Manifest {
  url: string;
  version: string;
  manifest: string;
  download: string;
  [key: string]: unknown;
}

/**
 * Name of the release archive for a version.
 * @param version - The release version, without a leading `v`
 * @returns The archive file name
 */
function archiveName(version: string): string {
  return `module-v${version}.zip`;
}

/**
 * Write the release version and its versioned download link into `module.json`.
 * @param version - The release version, without a leading `v`
 */
function stampManifest(version: string): void {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Manifest;

  manifest.version = version;
  manifest.manifest = STABLE_MANIFEST;
  manifest.download = `${manifest.url}/releases/download/v${version}/${archiveName(version)}`;

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  // Keep the committed manifest in the project's formatting so the CI format check still passes.
  execFileSync('pnpm', ['exec', 'prettier', '--write', MANIFEST], { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Write the release version into the Sphinx configuration.
 * @param version - The release version, without a leading `v`
 */
function stampDocs(version: string): void {
  const conf = fs.readFileSync(DOCS_CONF, 'utf8');
  const stamped = conf.replace(/^release\s*=.*$/m, `release = '${version}'`);
  if (stamped === conf && !conf.includes(`release = '${version}'`)) {
    throw new Error(`No "release = ..." line found in ${DOCS_CONF}`);
  }

  fs.writeFileSync(DOCS_CONF, stamped);
}

/**
 * Build the bundle from a clean `dist/` so nothing stale ends up in the package, and refuse to package a build that
 * holds the default proxy's or catalogue's key in plain text: they are only ever to be built in obscured.
 */
function build(): void {
  fs.rmSync(DIST, { recursive: true, force: true });
  execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' });
  for (const [name, variable] of [
    ["The default proxy's key", 'EMMA_DEFAULT_PROXY_KEY'],
    ["The default catalogue's key", 'EMMA_DEFAULT_CATALOGUE_KEY'],
  ] as const) {
    const key = process.env[variable];
    const leaks = key ? filesHolding(DIST, key) : [];
    if (leaks.length > 0) {
      throw new Error(`${name} is in plain text in: ${leaks.map(file => path.relative(ROOT, file)).join(', ')}`);
    }
  }
}

/**
 * Zip the package contents into `releases/module-v<version>.zip`, with `module.json` and the repository's licence,
 * readme and changelog at the archive root.
 * @param version - The release version, without a leading `v`
 * @returns The path of the created archive
 */
function createArchive(version: string): string {
  const archive = path.join(RELEASES, archiveName(version));
  const contents = PACKAGE_CONTENTS.filter(entry => fs.existsSync(path.join(ROOT, entry)));
  const shared = REPOSITORY_CONTENTS.filter(entry => fs.existsSync(path.join(REPOSITORY, entry)));

  fs.mkdirSync(RELEASES, { recursive: true });
  fs.rmSync(archive, { force: true });
  // Type declarations are for developers consuming the API, not for the Foundry runtime.
  execFileSync('zip', ['-r', '-D', archive, ...contents, '-x', '*.d.ts'], { cwd: ROOT, stdio: 'inherit' });
  // Zipped from the repository, so they too land at the archive root.
  execFileSync('zip', ['-D', archive, ...shared], { cwd: REPOSITORY, stdio: 'inherit' });

  return archive;
}

const releaseVersion = process.argv[2];
if (!releaseVersion || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
  console.error('Usage: node scripts/release/package.ts <version>   (e.g. 1.2.3)');
  process.exit(1);
}

stampManifest(releaseVersion);
stampDocs(releaseVersion);
build();
console.log(`Created ${path.relative(ROOT, createArchive(releaseVersion))}`);
