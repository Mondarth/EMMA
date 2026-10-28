/**
 * semantic-release configuration.
 *
 * Versions follow SemVer from the Conventional Commits history: `fix` → patch, `feat` → minor, and a `!` or
 * `BREAKING CHANGE:` footer → major. Releases are cut from `main` only; day-to-day work lands on `dev`.
 */
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
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
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'packages/module/releases/module-v*.zip', label: 'Foundry VTT module package' },
          { path: 'packages/module/module.json', label: 'Foundry VTT manifest' },
        ],
      },
    ],
  ],
};
