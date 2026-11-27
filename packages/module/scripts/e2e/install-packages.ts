#!/usr/bin/env node

/**
 * Install the pinned game system (and any modules) that EMMA - Enhanced Module Manager Application is tested with into the end-to-end test data
 * directory, along with the empty fixture modules in `tests/e2e/fixtures/modules` that the tests activate.
 *
 * Usage: `node scripts/e2e/install-packages.ts`, or with `--store` for the browser extension's store screenshots: the
 * made-up modules of `tests/e2e/store/modules` in place of the test fixtures, and the made-up worlds of
 * `tests/e2e/store/worlds.json`, each with the record the EMMA module would have written (see
 * `tests/e2e/store/screenshots.spec.ts`).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'tests/e2e/.data/Data');
const FIXTURES = path.join(ROOT, 'tests/e2e/fixtures/modules');
const STORE = path.join(ROOT, 'tests/e2e/store');

interface PinnedPackage {
  /** Directory under the Foundry user data folder: `systems` or `modules`. */
  type: 'systems' | 'modules';
  id: string;
  /** The manifest file that marks the package root inside the archive. */
  manifest: 'system.json' | 'module.json';
  url: string;
}

/** Bump these deliberately; the end-to-end tests run against exactly these builds. */
const PACKAGES: PinnedPackage[] = [
  {
    type: 'systems',
    id: 'dnd5e',
    manifest: 'system.json',
    url: 'https://github.com/foundryvtt/dnd5e/releases/download/release-5.3.3/dnd5e-release-5.3.3.zip',
  },
  {
    type: 'modules',
    id: 'lib-wrapper',
    manifest: 'module.json',
    url: 'https://github.com/ruipin/fvtt-lib-wrapper/releases/download/v1.13.5.1/lib-wrapper-v1.13.5.1.zip',
  },
];

/**
 * Find the directory inside an extracted archive that holds the package manifest: the archive root, or a single
 * top-level folder.
 * @param extracted - Directory the archive was extracted into
 * @param manifest - Manifest file name to look for
 * @returns The package root directory
 */
function findPackageRoot(extracted: string, manifest: string): string {
  if (fs.existsSync(path.join(extracted, manifest))) return extracted;

  const nested = fs
    .readdirSync(extracted, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(extracted, entry.name, manifest)));
  const [only] = nested;
  if (nested.length !== 1 || !only) throw new Error(`Could not find ${manifest} in the archive`);

  return path.join(extracted, only.name);
}

/**
 * Download and unpack one package, unless it is already installed.
 * @param pinned - The package to install
 */
async function install(pinned: PinnedPackage): Promise<void> {
  const target = path.join(DATA, pinned.type, pinned.id);
  if (fs.existsSync(path.join(target, pinned.manifest))) {
    console.log(`${pinned.id}: already installed`);
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), `mondarth-emma-e2e-${pinned.id}-`));
  try {
    const archive = path.join(work, 'package.zip');
    const extracted = path.join(work, 'extracted');

    const response = await fetch(pinned.url);
    if (!response.ok) throw new Error(`Download of ${pinned.url} failed: ${response.status} ${response.statusText}`);
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

    fs.mkdirSync(extracted);
    execFileSync('unzip', ['-q', archive, '-d', extracted], { stdio: 'inherit' });

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(findPackageRoot(extracted, pinned.manifest), target, { recursive: true });
    console.log(`${pinned.id}: installed from ${pinned.url}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Copy fixture modules into the test data, replacing any older copies so they always match the repository.
 * @param folder - The folder of modules to copy
 */
function installFixtures(folder: string = FIXTURES): void {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(DATA, 'modules', entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(path.join(folder, entry.name), target, { recursive: true });
    console.log(`${entry.name}: installed from ${path.relative(ROOT, folder)}`);
  }
}

/** A world of the store's screenshots: what `tests/e2e/store/worlds.json` gives. */
interface StoreWorld {
  readonly id: string;
  readonly title: string;
  /** The modules its record says it runs. */
  readonly modules: readonly { readonly id: string; readonly title: string; readonly version: string }[];
}

/**
 * Set the test data up for the store's screenshots: the made-up modules, without the test fixtures, whose names give
 * the game away, and the made-up worlds, never launched, each with the record the EMMA module writes in a world.
 */
function installStore(): void {
  for (const entry of fs.readdirSync(FIXTURES))
    fs.rmSync(path.join(DATA, 'modules', entry), { recursive: true, force: true });
  installFixtures(path.join(STORE, 'modules'));
  const { worlds } = JSON.parse(fs.readFileSync(path.join(STORE, 'worlds.json'), 'utf8')) as { worlds: StoreWorld[] };
  const system = { id: 'dnd5e', title: 'Dungeons & Dragons Fifth Edition', version: '5.3.3' };
  for (const world of worlds) {
    const folder = path.join(DATA, 'worlds', world.id);
    fs.mkdirSync(folder, { recursive: true });
    const manifest = {
      id: world.id,
      title: world.title,
      system: system.id,
      coreVersion: '14.368',
      systemVersion: system.version,
      compatibility: { minimum: '14', verified: '14.368' },
    };
    fs.writeFileSync(path.join(folder, 'world.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const record = {
      schema: 1,
      emma: '0.16.0',
      world: { id: world.id, title: world.title },
      core: '14.368',
      system,
      modules: [...world.modules].sort((a, b) => a.id.localeCompare(b.id)),
      updated: '2026-11-20T19:30:00.000Z',
    };
    fs.writeFileSync(path.join(folder, 'mondarth-emma.json'), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`${world.id}: made, with its record`);
  }
}

for (const pinned of PACKAGES) await install(pinned);
if (process.argv.includes('--store')) installStore();
else installFixtures();
