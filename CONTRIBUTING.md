# Contributing to EMMA - Enhanced Module Manager Application

## Setup

```sh
git switch dev
pnpm install   # also installs the git hooks (husky)
```

The pnpm version is pinned by `packageManager` in `package.json`. The module source is TypeScript only.

## Workflow

1. Create a short-lived branch from **`dev`**, named for the change: `feat/...`, `fix/...`, `docs/...`.
2. Write a failing test first, then the change.
3. Run the checks (below) and commit using Conventional Commits.
4. Open a pull request against **`dev`**. The **CI passed** check must be green before it is merged.

`main` only receives merges from `dev`, with a merge commit (never a squash), and each merge may produce a release.
`docs/developers/workflow.md` describes the branches and workflows in full, and `docs/developers/github-setup.md` how to
set up the GitHub repository for them.

## Checks

| Command                  | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `pnpm typecheck`         | Type-checks the module, the tooling scripts and the unit tests         |
| `pnpm run eslint`        | Lints the whole repository (Prettier formatting is reported by ESLint) |
| `pnpm test`              | Runs the unit tests                                                    |
| `pnpm run test:coverage` | Runs the unit tests and enforces the coverage thresholds               |
| `pnpm build`             | Builds the bundle and type declarations into `dist/`                   |

Every bug fix needs a regression test: write the failing test first, then the fix.

## Git hooks

- **pre-commit** runs `lint-staged` on the staged files: `eslint --fix`, the unit tests related to those files, a
  project-wide `pnpm typecheck` when TypeScript is staged, and `prettier --write` for JSON, CSS, Markdown and YAML.
- **prepare-commit-msg** opens the Commitizen prompt for a plain `git commit`.
- **commit-msg** validates the message with commitlint and rejects the commit if it fails.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and drive versioning, so they are enforced
strictly:

- The format is `type(scope): subject`. The scope is required.
- The header is at most 72 characters.
- The subject is in the imperative mood: `fix(hooks): remove stale listener`, not `removed` or `removes`.
- Breaking changes use `!` after the scope or a `BREAKING CHANGE:` footer.
- Reference issues in the footer as `Closes #123`.

The imperative check is heuristic. If it rejects a verb that really is imperative, add the verb to the `allowlist` in
`.commitlintrc.mjs` in the same commit rather than bypassing the hook.

## Emergency: committing with `--no-verify`

`git commit --no-verify` skips every hook. Use it only when a broken hook or tool is blocking an urgent fix, never to get
past a failing check. Afterwards, before pushing:

1. Fix whatever made the hooks unusable.
2. Run the checks the pre-commit hook would have run:

   ```sh
   pnpm typecheck && pnpm run eslint && pnpm test
   ```

3. Fix anything they report and stage the fixes.
4. Re-validate the commit, including its message, by amending it with the hooks enabled:

   ```sh
   git commit --amend
   ```

   The amend runs the pre-commit hook on anything staged and the commit-msg hook on the message. If it fails, fix the
   problem and amend again.

If the commit has already been pushed, do not amend it; push a follow-up commit that passes the hooks instead.

## Releases

Releases are fully automated; never bump a version or create a tag by hand. To release, open a pull request from `dev`
to `main` and merge it, with a merge commit, once **CI passed** and **E2E passed** are green.

1. The push to `main` runs the **Release** workflow, which first runs the whole of Dev CI.
2. When CI passes, [semantic-release](https://semantic-release.gitbook.io/) reads the commits since the last `v*` tag
   and decides the next version: `fix` → patch, `feat` → minor, `!` or `BREAKING CHANGE:` → major. Other types
   (`docs`, `test`, `ci`, …) do not trigger a release. Versions start from `0.0.0`: on its first run the workflow tags
   the repository's first commit `v0.0.0`, so the first `feat` is released as `0.1.0`. (A `fix` before any `feat`
   would be `0.0.1`, and a breaking change moves to `1.0.0`.)

   If a file in `.github/workflows` has changed since the first commit, the workflow tags the last commit that
   changed one instead, and warns that the commits before it do not count towards the first release. GitHub will not
   let the token put a tag on a commit with older workflow files. To count from the first commit all the same, push the
   tag yourself before the first release: `git tag v0.0.0 <first commit> && git push origin v0.0.0`.

3. `scripts/release/package.ts` stamps the version into `module.json` and `docs/conf.py`, builds from a clean `dist/`
   and creates `releases/module-v<version>.zip`.
4. `CHANGELOG.md`, `module.json` and `docs/conf.py` are committed back to `main` as `chore(release): <version>`, the
   commit is tagged, and a GitHub release is published with the zip and `module.json` attached.
5. The documentation is rebuilt and deployed, and `dev` is fast-forwarded to the release commit (or, if `dev` has moved
   on, a pull request from `main` to `dev` is opened; merge it with a merge commit).

The workflow pushes to the protected branches as a GitHub App, whose credentials are the `RELEASE_APP_CLIENT_ID`
variable and the `RELEASE_APP_PRIVATE_KEY` secret.

Foundry installs and updates the module from the stable manifest URL
`https://github.com/Mondarth/EMMA/releases/latest/download/module.json`.

To try the packaging step locally, run `node scripts/release/package.ts <version>` and then discard the changes it makes
to `module.json` and `docs/conf.py`.

## End-to-end tests

The Playwright tests in `tests/e2e` run against a real Foundry VTT server and are meant to run in CI (the **E2E**
workflow, on pull requests to `main`, which are the release pull requests from `dev`, and on manual dispatch). The workflow needs four repository secrets:
`FOUNDRY_USERNAME`, `FOUNDRY_PASSWORD`, `FOUNDRY_LICENSE_KEY` and `FOUNDRY_ADMIN_KEY`.

To run them locally, the test server and the tests take the credentials from `.foundryvtt/secrets.json`, the file the
development server uses (see `docs/developers/setup.md`), so nothing needs exporting. The test server runs on port 30001,
beside a development server on port 30000. To use a different secrets file, name it in `FOUNDRY_SECRETS_FILE`; a key it
lacks falls back to the matching variable above. Then:

```sh
pnpm build
pnpm run e2e:packages                    # install the pinned game system and the fixture modules into tests/e2e/.data
pnpm run e2e:server                      # start the pinned Foundry VTT server on http://localhost:30001
pnpm exec playwright install chromium    # once per Playwright version
pnpm run test:e2e --project=chromium
pnpm run e2e:server:stop
```

The fixture modules in `tests/e2e/fixtures/modules` are empty modules that the tests activate, so that saving can be
tested without touching EMMA. After changing them, run `pnpm run e2e:packages` again and restart the server, which only
finds new modules when it starts.

The first test run accepts the licence agreement, creates and launches a world, enables the module and creates a
player user. Delete `tests/e2e/.data` to start again from nothing. The Firefox project opens a browser window: headless
Firefox cannot create the WebGL context Foundry VTT needs. Without a desktop session (over SSH, in a container, in CI),
run the tests with `pnpm run test:e2e:xvfb` instead, which gives the browsers a virtual 1920x1080 display (`xvfb` must
and `xauth` must be installed: `sudo apt-get install xvfb xauth` on Debian or Ubuntu); it takes the same arguments, such as `--project=firefox`. Start the server with `pnpm run e2e:server` rather than
`docker compose` directly: the script first creates the directories the server mounts, which Docker would otherwise
create as root, and runs Foundry VTT as you, so that it can write to them; otherwise it hangs. The script replaces any
server left running, so a hung one is not reused.

Every test fails on an unexpected `console.error` or uncaught exception in the browser. Accepted messages go in the
allowlist in `tests/e2e/support/fixtures.ts`, each with a comment explaining it.

## AI Disclosure

This project was scaffolded with [create-fvtt-module](https://github.com/ulenarofmondarth/create-fvtt-module). The
tooling and configuration it started from were written in part with AI assistance (Claude Opus 5.5) and reviewed by a
human.

Development of the module itself continues with AI assistance (Claude Opus 5.5). All changes, whether written by a
person or with AI assistance, are reviewed by a human before they are merged.
