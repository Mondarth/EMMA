#!/usr/bin/env node

/**
 * Prepare a release of the browser extension: stamp the version into its `package.json`, which its manifests take it
 * from, build it for each browser with EMMA's catalogue, which it refuses to release without, check the
 * Firefox build and that its key is not in either build in plain text, and package both builds into `releases/`:
 *
 * - the Chromium build, zipped, for loading unpacked;
 * - the Firefox build, signed by Mozilla as an unlisted add-on when `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` hold an API
 *   key from addons.mozilla.org, or else zipped unsigned, which Firefox installs only until it restarts. A release run
 *   again for a version AMO holds already, or whose wait for the signature broke off, takes the add-on AMO signed
 *   then, once shown to be this build (see `scripts/amo.ts`).
 *
 * Run by semantic-release (see `release.config.js`) as `node packages/extension/scripts/release/package.ts <version>`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import os from 'node:os';

import { filesHolding } from '@mondarth/emma-core/files-holding';
import { requireReleaseDefaults } from '@mondarth/emma-core/release-defaults';

import { differences, downloadAmoFile, signedAmoFile } from '../amo.ts';
import type { AmoKey } from '../amo.ts';
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
 * Refuse a build that holds EMMA's catalogue key in plain text: it is only ever to be built in obscured.
 */
function build(): void {
  fs.rmSync(DIST, { recursive: true, force: true });
  // `<package>...` builds the package after the workspace packages it depends on.
  execFileSync('pnpm', ['--filter', '@mondarth/emma-extension...', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('pnpm', ['run', 'lint:firefox'], { cwd: ROOT, stdio: 'inherit' });
  for (const [name, variable] of [["The default catalogue's key", 'EMMA_DEFAULT_CATALOGUE_KEY']] as const) {
    const key = process.env[variable];
    const leaks = key ? filesHolding(DIST, key) : [];
    if (leaks.length > 0) {
      throw new Error(`${name} is in plain text in: ${leaks.map(file => path.relative(ROOT, file)).join(', ')}`);
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
 * Have Mozilla sign the Firefox build as an unlisted add-on.
 * @param archive - Where to put the signed add-on
 * @param version - The release version
 * @param key - The API key
 */
async function sign(archive: string, version: string, key: AmoKey): Promise<void> {
  const artifacts = path.join(RELEASES, 'web-ext-artifacts');
  try {
    // web-ext takes the key from its environment, which keeps it out of the command line.
    execFileSync(
      'pnpm',
      [
        'exec',
        'web-ext',
        'sign',
        '--channel',
        'unlisted',
        '--source-dir',
        'dist/firefox',
        '--artifacts-dir',
        artifacts,
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, WEB_EXT_API_KEY: key.issuer, WEB_EXT_API_SECRET: key.secret },
      },
    );
  } catch (error) {
    await signedBefore(archive, version, key, error);
    return;
  }
  const signed = fs.readdirSync(artifacts).filter(file => file.endsWith('.xpi'));
  if (signed.length !== 1 || signed[0] === undefined) {
    throw new Error(`Expected one signed add-on in ${artifacts}, found: ${signed.join(', ') || 'none'}`);
  }
  fs.renameSync(path.join(artifacts, signed[0]), archive);
  fs.rmSync(artifacts, { recursive: true, force: true });
}

/**
 * Take the add-on AMO signed for this version before, when signing it now failed: as a release run again for it is
 * refused, AMO never taking a version twice, or a release whose wait for the signature broke off. It is taken only if
 * its files are this build's.
 * @param archive - Where to put the signed add-on
 * @param version - The release version
 * @param key - The API key
 * @param failure - Why signing it now failed, thrown again if AMO does not hold the version
 * @throws {Error} The failure, if AMO does not hold the version; or why the add-on it holds cannot be taken
 */
async function signedBefore(archive: string, version: string, key: AmoKey, failure: unknown): Promise<void> {
  const options = { key, send: globalThis.fetch };
  const file = await signedAmoFile(GECKO_ID, version, options);
  if (file === undefined) throw failure;
  console.warn(`AMO holds ${version} already: taking the add-on it signed, if it is this build`);
  const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-amo-'));
  try {
    const xpi = path.join(unpacked, 'signed.xpi');
    fs.writeFileSync(xpi, await downloadAmoFile(file, options));
    const files = path.join(unpacked, 'files');
    execFileSync('unzip', ['-q', xpi, '-d', files], { stdio: 'inherit' });
    const differ = differences(path.join(DIST, 'firefox'), files);
    if (differ.length > 0) {
      throw new Error(
        `AMO holds ${version} from another build, which cannot be taken; release another version.\n${differ.join('\n')}`,
      );
    }
    fs.copyFileSync(xpi, archive);
  } finally {
    fs.rmSync(unpacked, { recursive: true, force: true });
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

  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;
  if (issuer && secret) {
    const signed = path.join(RELEASES, `emma-extension-firefox-v${version}.xpi`);
    await sign(signed, version, { issuer, secret });
    return [chromium, signed];
  }

  console.warn('No AMO_JWT_ISSUER and AMO_JWT_SECRET: the Firefox build is released unsigned');
  const unsigned = path.join(RELEASES, `emma-extension-firefox-v${version}-unsigned.zip`);
  zip(path.join(DIST, 'firefox'), unsigned);
  return [chromium, unsigned];
}

const releaseVersion = process.argv[2];
if (!releaseVersion || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
  console.error('Usage: node scripts/release/package.ts <version>   (e.g. 1.2.3)');
  process.exit(1);
}

// Before anything changes: a build without them succeeds, and the release would have no catalogue.
requireReleaseDefaults(process.env);
stampVersion(releaseVersion);
build();
for (const created of await createPackages(releaseVersion)) console.log(`Created ${path.relative(ROOT, created)}`);
