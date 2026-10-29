/**
 * semantic-release configuration for the browser extension, run from the repository's root by the release workflow
 * (`pnpm run release:extension`), after the module's release.
 *
 * Versions follow SemVer from the Conventional Commits history, as the module's do. Only the commits that change the
 * extension, or the workspace packages it is built from (the setup screen's code and the shared code), count towards
 * its releases (see docs/developers/releases.md).
 *
 * The extension is an alpha: each release is a GitHub pre-release, so that the latest release stays the module's.
 */
import path from 'node:path';

import { asPrerelease, onlyCommitsTo, packageFolders } from '@mondarth/emma-release';

/** The folders whose commits make up the extension's releases. */
const FOLDERS = packageFolders(path.resolve(import.meta.dirname, '../..'), 'packages/extension');

/** Where the packaging script leaves the builds to attach to the release. */
const RELEASES = 'packages/extension/releases';

export default {
  branches: ['main'],
  tagFormat: 'extension-v${version}',
  plugins: [
    await onlyCommitsTo(FOLDERS, ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }]),
    await onlyCommitsTo(FOLDERS, ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }]),
    ['@semantic-release/changelog', { changelogFile: 'packages/extension/CHANGELOG.md' }],
    // Stamps the version into package.json, builds, and packages the builds into packages/extension/releases.
    // Afterwards, hands the version to the later jobs of the release workflow.
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node packages/extension/scripts/release/package.ts ${nextRelease.version}',
        successCmd: 'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['packages/extension/CHANGELOG.md', 'packages/extension/package.json'],
        message: 'chore(release): extension ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    await asPrerelease(
      await onlyCommitsTo(FOLDERS, [
        '@semantic-release/github',
        {
          assets: [
            { path: `${RELEASES}/emma-extension-chromium-v*.zip`, label: 'Chromium extension, to load unpacked' },
            { path: `${RELEASES}/emma-extension-firefox-v*.xpi`, label: 'Firefox extension, signed by Mozilla' },
            { path: `${RELEASES}/emma-extension-firefox-v*-unsigned.zip`, label: 'Firefox extension, unsigned' },
          ],
          releaseNameTemplate: 'EMMA browser extension <%= nextRelease.version %> (alpha)',
          releaseBodyTemplate:
            'An alpha of the browser extension that brings EMMA to Foundry VTT’s setup screen, for testing only. See ' +
            '[installing the browser extension](https://mondarth.github.io/EMMA/extension.html).\n\n' +
            '<%= nextRelease.notes %>',
          successComment:
            ':tada: This <%= issue.pull_request ? "pull request" : "issue" %> is included in the browser extension’s ' +
            '[<%= nextRelease.version %> alpha](https://github.com/Mondarth/EMMA/releases/tag/<%= nextRelease.gitTag %>).',
          failTitle: 'The automated release of the browser extension is failing',
        },
      ]),
    ),
  ],
};
