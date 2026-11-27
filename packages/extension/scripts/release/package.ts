#!/usr/bin/env node

/**
 * Prepare a release of the browser extension: stamp the version into its `package.json`, which its manifests take it
 * from, build it for each browser with EMMA's catalogue, which it refuses to release without, check the
 * Firefox build and that its key is not in either build in plain text, and package both builds into `releases/`:
 *
 * - the Chromium build, zipped, for the Chrome Web Store, or for loading unpacked;
 * - the Firefox build, zipped, which, when `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` hold an API key from
 *   addons.mozilla.org, is submitted there as a listed version, for Mozilla's review, with the listing
 *   `store/amo-metadata.json` gives and the source it is built from (see `scripts/amo.ts`). The release does not wait
 *   for the review: Mozilla signs it once it approves it. A submission that fails is an error the release reports, but
 *   the release goes on, so that it can be submitted by hand.
 *
 * Run by semantic-release (see `release.config.js`) as `node packages/extension/scripts/release/package.ts <version>`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { filesHolding } from '@mondarth/emma-core/files-holding';
import { EXTENSION_RELEASE_DEFAULTS, requireReleaseDefaults } from '@mondarth/emma-core/release-defaults';

import { submitListed } from '../amo.ts';
import type { AmoKey, AmoListing } from '../amo.ts';
import { GECKO_ID } from '../manifest.ts';

/** The extension's package, `packages/extension`. */
const ROOT = path.resolve(import.meta.dirname, '../..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');

/**
 * Write the release version into `package.json`.
 * @param version - The release version, without a leading `v`
 */
function stampVersion(version: string): void {
  const manifest = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')) as Record<string, unknown>;
  manifest.version = version;
  fs.writeFileSync(PACKAGE_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  // Keep the committed file in the project's formatting so the CI format check still passes.
  execFileSync('pnpm', ['exec', 'prettier', '--write', PACKAGE_JSON], { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Build the extension, and the setup screen's script it takes in, from a clean `dist/`, and lint the Firefox build.
 * Refuse a build that holds the module's catalogue key: the extension asks the catalogue with its user's token, and
 * ships no key, so a key in it can only have been built in by mistake.
 */
function build(): void {
  fs.rmSync(DIST, { recursive: true, force: true });
  // `<package>...` builds the package after the workspace packages it depends on.
  execFileSync('pnpm', ['--filter', '@mondarth/emma-extension...', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('pnpm', ['run', 'lint:firefox'], { cwd: ROOT, stdio: 'inherit' });
  for (const [name, variable] of [["The module's catalogue key", 'EMMA_MODULE_CATALOGUE_KEY']] as const) {
    const key = process.env[variable];
    const leaks = key ? filesHolding(DIST, key) : [];
    if (leaks.length > 0) {
      throw new Error(`${name} is in: ${leaks.map(file => path.relative(ROOT, file)).join(', ')}`);
    }
  }
}

/**
 * Zip a folder's contents.
 * @param folder - The folder
 * @param archive - The archive to create
 */
function zip(folder: string, archive: string): void {
  execFileSync('zip', ['-r', '-D', archive, '.'], { cwd: folder, stdio: 'inherit' });
}

/**
 * The source the build is made from, archived for Mozilla's reviewers: the repository's files as they are now, the
 * version stamped into `package.json` among them, which is not committed yet.
 * @param archive - Where to put it
 */
function archiveSource(archive: string): void {
  const repository = path.resolve(ROOT, '../..');
  // A commit of the working tree's changes, without touching it; none if nothing has changed.
  const stashed = execFileSync('git', ['stash', 'create'], { cwd: repository, encoding: 'utf8' }).trim();
  execFileSync('git', ['archive', '--format=zip', '-o', archive, stashed || 'HEAD'], {
    cwd: repository,
    stdio: 'inherit',
  });
}

/**
 * Submit the Firefox build to addons.mozilla.org as a listed version, for Mozilla's review. A failure is reported as
 * the release's error, and the release goes on.
 * @param firefox - The Firefox build, zipped
 * @param version - The release version
 * @param key - The API key
 */
async function submit(firefox: string, version: string, key: AmoKey): Promise<void> {
  const source = path.join(RELEASES, `emma-source-v${version}.zip`);
  try {
    archiveSource(source);
    const listing = JSON.parse(fs.readFileSync(path.join(ROOT, 'store', 'amo-metadata.json'), 'utf8')) as AmoListing;
    const files = { build: fs.readFileSync(firefox), source: fs.readFileSync(source) };
    const result = await submitListed(GECKO_ID, version, files, listing, { key, send: globalThis.fetch });
    console.log(
      result === 'held'
        ? `addons.mozilla.org holds ${version} already: nothing more is submitted`
        : `Submitted ${version} to addons.mozilla.org, for Mozilla's review`,
    );
  } catch (error) {
    // GitHub's annotation, so that the run shows it: the release goes on without it.
    console.log(`::error title=addons.mozilla.org::${version} was not submitted: ${String(error)}`);
  } finally {
    fs.rmSync(source, { force: true });
  }
}

/**
 * Package both builds into `releases/`.
 * @param version - The release version, without a leading `v`
 * @returns The paths of the packages created
 */
async function createPackages(version: string): Promise<string[]> {
  fs.rmSync(RELEASES, { recursive: true, force: true });
  fs.mkdirSync(RELEASES, { recursive: true });

  const chromium = path.join(RELEASES, `emma-extension-chromium-v${version}.zip`);
  zip(path.join(DIST, 'chromium'), chromium);

  const firefox = path.join(RELEASES, `emma-extension-firefox-v${version}.zip`);
  zip(path.join(DIST, 'firefox'), firefox);

  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;
  if (issuer && secret) await submit(firefox, version, { issuer, secret });
  else console.warn('No AMO_JWT_ISSUER and AMO_JWT_SECRET: the Firefox build is not submitted to addons.mozilla.org');
  return [chromium, firefox];
}

const releaseVersion = process.argv[2];
if (!releaseVersion || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
  console.error('Usage: node scripts/release/package.ts <version>   (e.g. 1.2.3)');
  process.exit(1);
}

// Before anything changes: a build without them succeeds, and the release would have no catalogue.
requireReleaseDefaults(process.env, EXTENSION_RELEASE_DEFAULTS);
stampVersion(releaseVersion);
build();
for (const created of await createPackages(releaseVersion)) console.log(`Created ${path.relative(ROOT, created)}`);
