# Workflow

How changes travel from a branch to a release, and what each GitHub Actions workflow does on the way. To set the
repository up for it, see [](github-setup.md).

## Branches

`dev`
: The default branch, where work is integrated. Every change reaches it through a pull request.

`main`
: The released code. It only receives merges from `dev`, and every push to it may produce a release.

Short-lived branches
: One per change, created from `dev` and named for the change: `feat/…`, `fix/…`, `docs/…`.

Both `dev` and `main` are protected by rulesets: no direct pushes, force pushes or deletions, and a pull request whose
required checks have passed. Only the release App may bypass them, to push the release commit.

## Making a change

1. Create a branch from `dev`:

   ```sh
   git switch dev && git pull
   git switch -c feat/my-change
   ```

2. Write a failing test first, then the change. A bug fix starts with a test that reproduces the bug.
3. Commit with Conventional Commits; the commit hooks check each commit as you make it (see `CONTRIBUTING.md`).
4. Push and open a pull request against **`dev`**.
5. Merge once **CI passed** is green. Any merge method is allowed on `dev`.

## Releasing

1. Open a pull request from `dev` to `main`. Besides Dev CI, it runs the end-to-end tests, which must pass
   (**E2E passed**).
2. Merge it with a **merge commit**, the only method `main` allows, so that semantic-release sees every commit.
3. The *Release* workflow takes over: nothing in a release is done by hand.

The repository releases the module and the browser extension each on its own, from the commits that change it (see
{doc}`releases`). The commits since a package's last release decide its version:

| Commit                                                              | Release |
| ------------------------------------------------------------------- | ------- |
| `fix`                                                               | patch   |
| `feat`                                                              | minor   |
| `!` after the scope, or a `BREAKING CHANGE:` footer                 | major   |
| `docs`, `test`, `refactor`, `style`, `perf`, `build`, `ci`, `chore` | none    |

A merge with no `fix`, `feat` or breaking change to a package releases nothing of it; the commits are released with the
next one that does.

## Workflows

| Workflow                                 | Runs on                                                    | Purpose                                                       |
| ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Dev CI (`dev.yml`)                       | pushes to `dev`, pull requests, the release workflow       | The quality gate                                              |
| E2E (`e2e.yml`)                          | pull requests to `main`, by hand                           | Playwright against a real Foundry VTT server                  |
| Release (`release.yml`)                  | pushes to `main`, by hand                                  | Dev CI, then semantic-release, the docs and the `dev` update  |
| Build and Deploy Docs                    | pushes to `main` that change `docs/`, the release workflow | Builds the Sphinx site and deploys it to GitHub Pages         |
| CodeQL (`codeql.yml`)                    | pushes and pull requests to `dev` and `main`, weekly       | Code scanning of the TypeScript and of the workflows|
| Dependency review                        | pull requests                                              | Fails pull requests that add vulnerable dependencies          |

### Dev CI

The full quality gate, run on every push to `dev`, on every pull request to `dev` or `main`, and as the first stage of
every release. Its jobs run in parallel:

| Job             | Checks                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| Commit messages | commitlint over the pull request's commits (pull requests only)                             |
| Typecheck       | `pnpm typecheck`: the module, the tooling scripts and the unit tests                        |
| Lint            | ESLint with no warnings allowed, and Prettier for the remaining file types                  |
| Svelte check    | `svelte-check`, once the project has a component                                            |
| Unit tests      | the tests with the coverage thresholds; uploads the coverage to Codecov                     |
| Build           | builds every package, keeping the module, with `module.json`, and the extension as artifacts; lints the Firefox extension with `web-ext lint` and loads the Chromium extension into Chromium |
| Docs            | builds the documentation in Docker and keeps it as an artifact                              |
| CI passed       | succeeds only if every job above passed or was skipped: the rulesets' required check        |

A newer push to a pull request cancels the run in progress. Artifacts are kept for seven days.

### E2E

Builds the module, installs the pinned game system, starts the pinned Foundry VTT server in Docker and runs the
Playwright suite in Chromium, Firefox and WebKit, one browser at a time: one licence runs one server at a time. It
comments the result on the pull request and attaches the Playwright reports to the run. **E2E passed** is the check
for the `main` ruleset to require.

Because it needs the Foundry VTT licence and takes a while, it runs on pull requests to `main` rather than on every
pull request. Start it by hand (*Actions → E2E → Run workflow*) to test a branch sooner. Pull requests from forks
cannot read the licence secrets, so it is skipped for them.

### Release

Runs on every push to `main`:

1. **CI**: the whole of Dev CI. Nothing is released unless it passes.
2. **Semantic release**, with a token from the release App, releases each package from the commits that change it (see
   {doc}`releases`). First **the module**:
   1. on the very first run, tags the first commit `v0.0.0`, so that versions start at `0.x` (see `CONTRIBUTING.md`);
   2. works out the next version from the commits since the last `v*` tag, and stops if none warrants a release;
   3. writes the release notes and `CHANGELOG.md`;
   4. runs `packages/module/scripts/release/package.ts`, which stamps the version into `module.json` and `docs/conf.py`, builds
      the module and zips it as `releases/module-v<version>.zip`;
   5. commits `chore(release): <version> [skip ci]` to `main` and tags it `v<version>`;
   6. publishes the GitHub release with the zip and `module.json` attached.

   Then **the browser extension**, in the same way, from the commits since the last `extension-v*` tag: its notes go
   into `packages/extension/CHANGELOG.md`, `packages/extension/scripts/release/package.ts` stamps the version into its
   `package.json`, builds and checks it and packages the Chromium and Firefox builds (the Firefox build signed by
   Mozilla, given the `AMO_` secrets; see {doc}`github-setup`), and the release commit `chore(release): extension
   <version> [skip ci]` is tagged `extension-v<version>`. Its GitHub release is a pre-release.
3. If either package was released, in parallel:
   - **Publish documentation** builds the site from `main` and deploys it to GitHub Pages.
   - **Bring dev up to date** fast-forwards `dev` to the release commits, so that `dev` carries the new versions and
     changelogs. If `dev` has moved on in the meantime, it opens a pull request from `main` to `dev` instead; merge it
     with a merge commit.

Foundry VTT installs and updates the module from the manifest committed to `main`, which the release commit
updates:

```
https://raw.githubusercontent.com/Mondarth/EMMA/main/packages/module/module.json
```

It does not depend on which GitHub release is the latest, which need not be the module's once the repository releases
other packages too. Changes to the manifest merged into `main` without a release keep the released version, so Foundry
offers no update for them. Each release also keeps its own manifest, at
`https://github.com/Mondarth/EMMA/releases/download/v<version>/module.json`, for installing that version.

Copies installed from the earlier URL, `https://github.com/Mondarth/EMMA/releases/latest/download/module.json`, find the next
release there, and its manifest moves them to the URL above. That is why the module's releases stay GitHub's latest,
and the extension's are pre-releases.

The workflow can also be started by hand on `main` (*Actions → Release → Run workflow*). It then releases only if
there are releasable commits.

## Dependency updates

Dependabot checks weekly for updates to the npm packages, the GitHub Actions, the documentation's Python requirements
and its Docker image, and raises them as pull requests against `dev`. Related packages are grouped into one pull
request (Vitest, the commit tooling, semantic-release). Review and merge them like any other pull request; they reach
users with the next release.

Major updates of `conventional-changelog-conventionalcommits` are ignored: version 10 needs a newer
`conventional-changelog-writer` than semantic-release's release-notes generator uses, and the release notes would fail
to render. Lift the rule in `.github/dependabot.yml` once the generator catches up.

With Dependabot security updates on, Dependabot also opens pull requests for vulnerable dependencies as soon as an
advisory is published. A security update may bump one package of a group on its own; if it breaks the build (for
example `vitest` without `@vitest/coverage-v8`), close it and merge the grouped update instead.

## Coverage

The unit tests fail when coverage drops below the thresholds in `packages/module/vite.config.ts`. Set them just below the measured
level and raise them as tests are added; never lower them to get a change through. When a tool upgrade changes how
coverage is measured, re-measure and say so in the commit.

Statements, functions and lines must be fully covered. Branches need 97%, not 100%, because Svelte compiles each
`{value}` in a component's markup to `value ?? ''`, a branch that a string value never takes, so a few branches cannot
be covered. Any other uncovered branch needs a test.

Coverage is also uploaded to Codecov, which comments the change on each pull request. Its checks are informational.
