# Releases

The repository releases two of its packages, each on its own: the Foundry VTT module and the browser extension. Each
has its own versions, tags, changelog and GitHub releases, made by semantic-release from the commits that change it.
The *Release* workflow releases both on every push to `main` (see {doc}`workflow`); nothing in a release is done by
hand.

## The release streams

|                    | The module                                                | The browser extension                                         |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| Configuration      | `packages/module/release.config.js`                       | `packages/extension/release.config.js`                        |
| Run by             | `pnpm run release:module`, first                          | `pnpm run release:extension`, second                          |
| Counts commits to  | `packages/module`, `packages/core`                        | `packages/extension`, `packages/setup`, `packages/core`       |
| Tags               | `v<version>`                                              | `extension-v<version>`                                        |
| Changelog          | `CHANGELOG.md`                                            | `packages/extension/CHANGELOG.md`                             |
| Version kept in    | `packages/module/module.json`, `docs/conf.py`             | `packages/extension/package.json`, which its manifests use    |
| Packaged by        | `packages/module/scripts/release/package.ts`              | `packages/extension/scripts/release/package.ts`               |
| GitHub release     | the latest release, with the zip and `module.json`        | a pre-release, with the Chromium zip and the Firefox add-on   |
| Release commit     | `chore(release): <version> [skip ci]`                     | `chore(release): extension <version> [skip ci]`               |

Both streams run from the repository's root, so that each can commit files outside its package, such as the module's
`docs/conf.py`. The extension's stream runs after the module's, from the module's release commit if there is one.

### Which commits count

A package's releases are made from the commits that change files in its folder, or in the folders of the workspace
packages it depends on (`workspace:` dependencies in its `package.json`, development dependencies included, since a
package's build takes them in). A `fix(core)` commit is released in both packages; a `fix(extension)` commit only in the
extension. A commit that changes both packages is released in both, and appears in both changelogs.

What a package depends on is read from the `package.json` files when semantic-release starts, so a new dependency
between packages counts from then on, with nothing else to change.

Commits that change only files outside every package, such as the root `package.json`, the workflows or the
documentation, are released with neither. That suits the commit types they usually have (`build`, `ci`, `docs`),
which release nothing anyway. A merge commit changes no folder of its own: the commits it merges are counted instead.

The version follows from the commits that count, as in {doc}`workflow`: `fix` → patch, `feat` → minor, `!` or
`BREAKING CHANGE:` → major. A merge to `main` may release the module, the extension, both or neither.

### Why the extension's releases are pre-releases

Copies of the module installed before 0.9.0 find updates at
`https://github.com/Mondarth/EMMA/releases/latest/download/module.json`, GitHub's **latest** release. If an extension
release became the latest, they would find no manifest there. So the extension's releases are always published as
pre-releases, which GitHub never makes the latest: they are alphas, too. The module's releases stay the latest.

### Tags

semantic-release finds a stream's last release by its tags: `v<version>` for the module and `extension-v<version>`
for the extension, and neither format matches the other's tags. The module's tags must stay `v<version>`: the download
links in its manifests are made from them, and the package catalogue reads its versions from its GitHub releases.

## The release tooling: `packages/release`

semantic-release reads every commit on the branch, whichever package it changes. `@mondarth/emma-release`, a package of
the workspace, holds the plugin wrappers the release configurations use to keep each stream to its own commits. It is
release tooling, not part of any release: its own commits count towards neither stream.

`packageFolders(root, folder)`
: The folders whose commits make up a package's releases: the package's own and those of the workspace packages it
  depends on, directly or through others, sorted.

`onlyCommitsTo(folders, plugin)`
: Wraps a plugin so that each of its steps is told only of the commits that change the folders. The configurations
  wrap the three plugins that read the commits: `@semantic-release/commit-analyzer` (the version),
  `@semantic-release/release-notes-generator` (the notes and changelog) and `@semantic-release/github` (the comments
  and labels it leaves on the issues and pull requests a release closes). It reads which files each commit changes
  with one `git diff-tree`.

`asPrerelease(plugin)`
: Wraps a plugin so that it is told the release is a pre-release, and not on the main release branch.
  `@semantic-release/github` decides from the branch alone whether a release is a pre-release and whether it is the
  latest, so wrapped it publishes a pre-release that is never the latest.

A wrapped plugin is an inline plugin: the wrapper loads the plugin's module and gives the configuration the plugin's
steps, each wrapped. As semantic-release reads a plugin's steps when it reads the configuration, the configuration
awaits the wrappers:

```js
const FOLDERS = packageFolders(path.resolve(import.meta.dirname, '../..'), 'packages/extension');

export default {
  plugins: [
    await onlyCommitsTo(FOLDERS, ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }]),
    await asPrerelease(await onlyCommitsTo(FOLDERS, ['@semantic-release/github', { assets: [] }])),
  ],
};
```

In the release's log, a wrapped plugin is named for the plugin and what the wrappers do, such as
`@semantic-release/github, on packages/core, packages/extension, packages/setup, as a pre-release`, and
`onlyCommitsTo` says how many of the commits count.

The package's tests run semantic-release itself, in throwaway repositories, and the real `@semantic-release/github`
against a local stand-in for GitHub's API. Its tests also check both release configurations: their tags, the folders
they count, and that the extension's stream changes only the extension's files.

### Why not semantic-release-monorepo or multi-semantic-release

semantic-release-monorepo counts only the commits to a package's own folder, so a fix to the shared code would release
neither package that is built from it. multi-semantic-release follows the dependencies between packages, but only by
releasing them: the shared packages would need versions and tags of their own, and it rewrites `workspace:` ranges to
versions while it releases. Wrapping the plugins keeps the repository's existing tags and releases only what is
published.

## Adding a package to the releases

1. Give the package a `release.config.js`, from the extension's: its folders from `packageFolders`, a tag format that
   matches no other stream's tags, its own changelog, and a `failTitle` of its own for `@semantic-release/github`, so
   that each stream reports a failing release in an issue of its own.
2. Before its first release, tag the commit to count its commits from, such as `git tag <name>-v0.0.0 <commit>`.
   Otherwise its first release is `1.0.0` and counts every commit before it.
3. Add a `release:<name>` script to the root `package.json`, and a step that runs it to the *Release* workflow, after
   the others, with an `id` whose `version` output the later jobs check.
4. Add its configuration to `packages/release/tests/configs.test.ts`.

## Trying a release locally

The packaging scripts can be run on their own, from the repository's root:

- `node packages/module/scripts/release/package.ts <version>` stamps, builds and zips the module; discard its changes
  to `packages/module/module.json` and `docs/conf.py` afterwards.
- `node packages/extension/scripts/release/package.ts <version>` stamps, builds and packages the extension into
  `packages/extension/releases/`, unsigned unless `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` are set; discard its change to
  `packages/extension/package.json` afterwards.

`pnpm --filter @mondarth/emma-release test` runs the release tooling's tests.
