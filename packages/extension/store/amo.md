# addons.mozilla.org (AMO)

The add-on, `emma@mondarth`, exists already, with unlisted versions only. Its first **listed** version makes it listed:
submit it on the listed channel, with the listing below. Later versions need only the version's own fields.

## Submitting the first listed version

With `web-ext` (as the release signs unlisted versions now), from the release's Firefox build:

```sh
web-ext sign --channel listed --source-dir packages/extension/dist/firefox \
  --amo-metadata packages/extension/store/amo-metadata.json \
  --upload-source-code emma-source.zip --approval-timeout 0
```

If `web-ext` does not set the add-on's own fields (name, summary, description, categories) for an add-on that exists
already, set them first with the API: `PATCH /api/v5/addons/addon/emma@mondarth/` with the same fields as
`amo-metadata.json` but `version`.

## Listing (the add-on's)

- **Name:** EMMA for Foundry VTT
- **Add-on URL (slug):** as it is (`emma-for-foundry-vtt`, or what AMO gave it).
- **Summary** (250 characters at most):
  > Manage a Foundry VTT server's game systems, modules and Foundry updates from its setup screen: see what every
  > world uses, plan updates that keep every world working, and install them through Foundry's own installer.
- **Description:** [`description.md`](description.md).
- **Categories (Firefox):** Games & Entertainment (`games-entertainment`).
- **Tags:** none needed.
- **Support e-mail:** to add (none is given here).
- **Support site:** https://github.com/Mondarth/EMMA/issues
- **Homepage:** https://mondarth.github.io/EMMA/extension.html
- **Requires payment, non-free services or software, or additional hardware:** **Yes**. Finding updates and packages
  to install needs an EMMA subscription, and the extension needs a Foundry VTT server, which needs a Foundry VTT
  licence. The installation tree works without a subscription.
- **Experimental:** No.
- **Licence:** MIT (`MIT`).
- **Privacy policy:** link to https://accounts.mondarth.com/privacy, or paste its text: AMO wants one, as the extension
  sends data off the device (below).
- **Icon:** `public/icons/emma-128.png` (AMO takes it from the add-on, or an upload of 128 × 128).
- **Screenshots** (1280 × 800 at best, up to 10), the same as the Chrome Web Store's (see `chrome.md`).

## Data collection (the manifest's)

Firefox shows what an add-on collects at install, from `browser_specific_settings.gecko.data_collection_permissions`
in its manifest (`scripts/manifest.ts`), and AMO's review holds it to it:

- **required:** `authenticationInfo` (the sign-in token to EMMA's catalogue, sent with each request to it) and
  `websiteContent` (the IDs, versions and manifest URLs of the packages installed on the user's Foundry VTT server,
  read from its setup screen, and a manifest URL the user gives, sent to the catalogue to find updates).
- **optional:** none.

## Notes to reviewer (the version's)

> EMMA runs only on the setup screen (`/setup`) of a Foundry VTT server (self-hosted, at any address), and only once
> the user activates it there from the toolbar button, which asks for that server's host permission. It runs only the
> extension's own scripts: one in the isolated world (the bridge to the extension), and one in the page's own world,
> as it drives Foundry's own setup-screen client (`game`, `foundry`) to read what is installed and to install
> packages through Foundry's own installer.
>
> It talks to two services of its own: EMMA's package catalogue (https://catalogue.mondarth.com), which it asks for
> updates, Foundry's package listing and manifests, and Mondarth's accounts (https://accounts.mondarth.com), where the
> user signs in with a device code, from the options page. The catalogue needs a subscription; without one, EMMA shows
> the installation but finds no updates.
>
> To try it, it needs a Foundry VTT server (version 14 or later) and its administrator password; we can give you one,
> and an account with a subscription, on request.
>
> The build is bundled and minified by Vite from TypeScript and Svelte; the source is attached, and public at
> https://github.com/Mondarth/EMMA. Building it is described below.

## Source code instructions (the version's)

> Requirements: Node.js 24, pnpm 12 (the version in the root `package.json`'s `packageManager`; `corepack enable`
> gives it), `zip`, on Linux or macOS.
>
> ```sh
> pnpm install --frozen-lockfile
> EMMA_DEFAULT_CATALOGUE_URL=https://catalogue.mondarth.com/ \
> EMMA_ACCOUNTS_URL=https://accounts.mondarth.com \
>   pnpm --filter '@mondarth/emma-extension...' run build
> ```
>
> The Firefox build is then in `packages/extension/dist/firefox`, as submitted. The two variables give the services'
> addresses, built in as plain text; nothing secret is built in. `packages/extension/scripts/release/package.ts` is the
> release's own script, which also zips and signs.
>
> The source archive is `git archive` of the release's tag, `extension-v<version>`.
