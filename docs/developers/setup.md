# Setup

Once the [](prerequisites.md) are installed, setup is simple enough.

```sh
git clone https://github.com/Mondarth/EMMA.git
cd EMMA
git switch dev
pnpm install
```

`pnpm install` also installs the git hooks. Work happens on branches from `dev`; [](workflow.md) describes how changes
reach a release, and `CONTRIBUTING.md` the checks and commit message rules.

## Running a development Foundry VTT

The compose file in `.foundryvtt/` runs the pinned Foundry VTT release (`VERSION` in `.foundryvtt/.env`) with
`packages/module/module.json` and `packages/module/dist` mounted, read-only, as the `mondarth-emma` module: only what
Foundry VTT loads, as the release package lays it out. Mounting the whole of `packages/module` would bring in its
`node_modules` too, whose links point outside it, so that Foundry VTT's **Create a Snapshot** fails on them.

1. Copy `.foundryvtt/secrets.example.json` to `.foundryvtt/secrets.json` and fill in your foundryvtt.com credentials,
   your licence key and an admin password for the server. The file is ignored by {program}`git`.
2. Build the module once, so that Foundry finds the bundle named in `packages/module/module.json`:

   ```sh
   pnpm build
   ```

3. Start Foundry VTT on <http://localhost:30000>:

   ```sh
   pnpm serve:vtt
   ```

   The server keeps its data in `.foundryvtt/data`, which is ignored by {program}`git`. The script creates the
   directory if it is missing, down to the places this project is mounted inside it, so that they belong to you: left
   to Docker, they would be created as root. It then runs Foundry VTT as you rather than as the image's own user (uid
   1000), so that Foundry VTT can write there; otherwise it hangs. For the same reason, do not start the server with
   `docker compose up` directly.

   The `dist` folder must exist when the server starts, so build first. `pnpm build` writes into it without removing
   it, so the server sees each build. Anything that removes `dist` and makes it again, such as packaging a release,
   leaves the server with the old, removed folder: restart it with `docker compose restart` in `.foundryvtt/`.

   If this is the first time the VTT server has been run then it will take a few seconds to become available (the Foundry VTT xip is downloaded and installed). You will also need to complete the initial setup of Foundry (accepting the license etc.).

4. Start the {{HMR}} development server:

   ```sh
   pnpm dev
   ```

   Open <http://localhost:31002> rather than port 30000. The development server serves the module straight from
   `packages/module/src/`
   and passes everything else on to Foundry VTT.

   The host name the development server answers to (besides `localhost`) and the two ports default to the values in
   `DEFAULTS` at the top of `packages/module/vite.config.ts`. To change them on one machine without editing that file,
   create `.pdt/mount.json` at the root of the repository, which is ignored by {program}`git`. Every key is optional:

   ```json
   { "hostname": "my-dev-box", "ports": { "base": 30000, "dev": 31002 } }
   ```

   Set the `PDT_MOUNT_CONFIG` environment variable to read the settings from a different file; a relative path is
   resolved from the root of the repository.

## Working on the EMMA extension

The **EMMA extension** is EMMA on Foundry VTT's setup screen, as the browser extension brings it in
(`packages/setup`); "the browser extension" is the extension itself (`packages/extension`). The EMMA extension can be
worked on without the browser extension: its own development server passes a local Foundry VTT through, and adds the
EMMA extension's source to the setup page.

1. Start Foundry VTT, as above, and return it to the setup screen if a world is running.
2. Start the EMMA extension's development server:

   ```sh
   pnpm dev:setup
   ```

3. Open <http://localhost:31003/setup> rather than port 30000, and the EMMA button in the setup screen's menu. Each
   change to `packages/setup/src/` reloads the page.

The server reads `hostname` and `ports.base` from `.pdt/mount.json`, as the module's does, and its own port from
`ports.setup`:

```json
{ "hostname": "my-dev-box", "ports": { "base": 30000, "dev": 31002, "setup": 31003 } }
```

Finding updates needs the EMMA module installed in that Foundry, with its setup kit built: `pnpm build` in
`packages/module` builds both into `dist/`, which the development Foundry loads (see {doc}`architecture`). Rebuild it
after changing `src/setup-kit.ts` and read the installation again.

A development build has no package catalogue or version lookup proxy, so it finds fewer updates (see
{doc}`default-proxy`). To try the EMMA extension with them, start the server with `EMMA_DEFAULT_CATALOGUE_URL` and
`EMMA_DEFAULT_CATALOGUE_KEY` set to a catalogue of your own, and `EMMA_DEFAULT_PROXY_URL` and `EMMA_DEFAULT_PROXY_KEY`
to a proxy of your own; never commit them.

Do not have the browser extension active for the development server's address as well: the EMMA extension starts once
on a page, so the one that starts first would win.

## The module manifest

`module.json` was filled in when the project was generated. Review:

`title` and `description`
: These appear on Foundry's Add-on Modules page. Keep the description short.

`authors`
: Provide at least one author entry.

`compatibility`
: Which versions of Foundry this module is compatible with.

`relationships`
: Any game systems and modules this module requires.

You may also need to set various other values in `module.json` (e.g. `socket` if your module uses sockets), but
these will vary widely according to what your module does.

The release workflow maintains the following entries, so leave them alone:

- `version`
- `manifest`
- `download`

## Repository settings

The workflows in `.github/workflows` need a release GitHub App, a few secrets, GitHub Pages, and rulesets protecting
`dev` and `main`. [](github-setup.md) walks through setting them up.
