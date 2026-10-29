/**
 * semantic-release configuration for the Foundry VTT module, run from the repository's root by the release workflow
 * (`pnpm run release:module`).
 *
 * Versions follow SemVer from the Conventional Commits history: `fix` → patch, `feat` → minor, and a `!` or
 * `BREAKING CHANGE:` footer → major. Releases are cut from `main` only; day-to-day work lands on `dev`.
 *
 * The repository releases each of its packages on its own (see docs/developers/releases.md): only the commits that
 * change the module, or the workspace packages it is built from, count towards its releases, its release notes and the
 * comments left on what a release closes.
 */
import path from 'node:path';

import { onlyCommitsTo, packageFolders } from '@mondarth/emma-release';

/** The folders whose commits make up the module's releases. */
const FOLDERS = packageFolders(path.resolve(import.meta.dirname, '../..'), 'packages/module');

export default {
  branches: ['main'],
  // The module's tags stay `v<version>`: its manifests' download links (scripts/release/package.ts) and the package
  // catalogue's record of its releases are made from them.
  tagFormat: 'v${version}',
  plugins: [
    await onlyCommitsTo(FOLDERS, ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }]),
    await onlyCommitsTo(FOLDERS, ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }]),
    '@semantic-release/changelog',
    // Stamps the version into module.json and docs/conf.py, builds, and zips packages/module/releases/module-v<version>.zip.
    // Afterwards, hands the version to the later jobs of the release workflow.
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node packages/module/scripts/release/package.ts ${nextRelease.version}',
        successCmd: 'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"',
      },
    ],
    // Committing module.json to main updates the stable manifest URL Foundry finds updates at.
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'packages/module/module.json', 'docs/conf.py'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    // module.json is attached so that each release has a manifest of its own, for installing that version. Foundry
    // finds updates from the copy committed to main (see packages/module/scripts/release/package.ts).
    await onlyCommitsTo(FOLDERS, [
      '@semantic-release/github',
      {
        assets: [
          { path: 'packages/module/releases/module-v*.zip', label: 'Foundry VTT module package' },
          { path: 'packages/module/module.json', label: 'Foundry VTT manifest' },
        ],
        failTitle: 'The automated release of the module is failing',
      },
    ]),
  ],
};
