# The default catalogue

EMMA looks up versions in a default package catalogue, built into every release: the
[Foundry VTT package catalogue](https://mondarth.github.io/fvtt-package-catalogue/). It is the only service EMMA asks
for versions, from the module and from the EMMA extension alike. The module asks it with an API key of its own; the
EMMA extension asks it as its signed-in user, with their token, and ships no key. Earlier versions also
asked a CORS proxy; it is no longer built in or used.

## How EMMA asks it

The catalogue keeps every release of Foundry's listed packages and of the packages it is asked for, loaded from their
manifests, with everything they require and run in, and Foundry's own builds. EMMA asks its version 2 through
`@mondarth/fvtt-resolver`'s `catalogueSet`, in one `POST /api/v2/lookup` for the installed packages, with their
installed versions, the manifest URLs they came from, and the generation of Foundry in use.

- **In the module**, hypothetical mode asks once, when it first needs versions (`src/module/adapters/versions.ts`),
  and names itself as `EMMA/<version>` in `X-Catalogue-Client`. `versionLookup()` (`src/module/settings.ts`) gives
  the catalogue the build has.
- **In the EMMA extension**, on the setup screen, the search for updates asks once a visit
  (`packages/setup/src/foundry/releases.ts`), and the extension also reads the Install sections' listing
  (`GET /api/v2/listing`), has packages' own manifests checked again for **Check live** (`POST /api/v2/recheck`), and
  reads a manifest URL the user gives (`POST /api/v2/manifest`). It names itself as `EMMA-extension/<version>`.
- **The module, directly.** The catalogue sends CORS headers, so the browser asks it itself, with the module's key in
  `X-API-Key`. The catalogue lists that key as `module:<key>`, which reaches lookups alone, all the module asks.
- **The EMMA extension, as its user.** The user signs the browser extension in to the catalogue from its options page,
  by approving it on the catalogue's site (OAuth 2's device authorization grant: `/auth/device/code`, then
  `/auth/device/token`; `packages/extension/src/browser/catalogue.ts`). The token is kept in the extension's storage,
  which Foundry's page cannot read. The setup screen's script posts each request to its own window; the extension's
  bridge, a content script in the same tab, takes it to the background script, which asks the catalogue with
  `Authorization: Bearer <token>`, and the bridge posts the answer back
  (`packages/core/src/catalogue-relay.ts`, `packages/setup/src/foundry/catalogue-relay.ts`). The background lets
  through only the catalogue's own origin and the endpoints above, with `/api/v2/me`, and only for tabs it brought EMMA
  into. Before it asks, the setup screen reads `/api/v2/me`: a user not signed in is asked to sign in, and one whose
  subscription ended to renew it, in its footer.
- **Without it.** A build without a catalogue, or a catalogue that cannot be reached, leaves EMMA knowing only what is
  installed, and saying so.

## What protects it

The module's key ships inside every release of the module, and the browser sends it with every lookup: any GM can read
it in the browser's network tab. It cannot be kept secret, so it is not what protects the catalogue. It only says which client
is asking. What protects the catalogue is that it is of little use for anything else: the data it gives is public
package information, it serves nothing else, and its rate limits bound what any one caller can cost. So a key that
leaks lets someone read public Foundry package information, a little faster than they could anyway: the module's key
reaches lookups alone. What a subscription gives, the EMMA extension's use of the catalogue, is reached only with a
subscriber's token, which no release holds.

## How the key is built in

The release workflow sets two values in the environment of the module's release build, and the first alone in the
browser extension's:

`EMMA_DEFAULT_CATALOGUE_URL`
: A repository variable: the catalogue's `https` URL.

`EMMA_MODULE_CATALOGUE_KEY`
: A repository secret: the module's API key.

`packages/core/scripts/default-catalogue-define.ts` gives both to the module's Vite `define` as
`__EMMA_DEFAULT_CATALOGUE__`,
obscured by `packages/core/src/obscure.ts`: each is split into chunks, and each chunk masked by bytes of its own that
look random, so neither the key nor any long run of it is in the bundle as text. The pads are made from the text, so
every build of a release is the same, which signing the extension again relies on (see
[Releases](releases.md#signing-the-extension-again)). It is not encryption, as the pads ship beside the chunks; it keeps the key out of casual sight, and out of a search of the code.
EMMA reveals it when it uses it, with `defaultCatalogue()` (`src/module/lib/default-catalogue.ts`, through
`packages/core/src/default-catalogue.ts`). The setup screen's script and the browser extension are built with the URL
alone, as `__EMMA_CATALOGUE_URL__` (`catalogueUrlDefine`), which is no secret.

The build stops when only one of the two is set, or when the URL is not `https`. After building, the module's release
refuses to package a bundle that holds the key in plain text anywhere, and the browser extension's one that holds it
at all. A release stops, before it changes anything, when what it needs is not set
(`packages/core/scripts/release-defaults.ts`). Development,
CI and test builds need neither, so have no catalogue unless they are set, and the unit tests always run without one. A development build may name a catalogue of the developer's own in `EMMA_DEV_CATALOGUE_URL`, `http` allowed, which a release refuses (see {doc}`setup`).
The end-to-end tests build in a made-up catalogue, which they answer themselves (see `.github/workflows/e2e.yml`).

## Rotating the key

Give each release of the module a new key, and keep the catalogue accepting the keys of the releases still in use. The catalogue's
`API_KEYS` is a list, so a key can be added before a release and removed once no one uses that release any more.

1. Make a new key: `openssl rand -hex 32`.
2. Add it to the catalogue's `API_KEYS` as `module:<key>`, keeping the current one, and restart the catalogue.
3. Set it as the `EMMA_MODULE_CATALOGUE_KEY` secret: `gh secret set EMMA_MODULE_CATALOGUE_KEY --repo Mondarth/EMMA`,
   pasting the key alone.
4. Release the module. The new release uses the new key; earlier ones keep using theirs.
5. Once the release before last is rarely seen (the catalogue's logs give each request's `X-Catalogue-Client`), remove
   its key from `API_KEYS`. Keeping two or three keys gives GMs time to update.

If a key is abused, remove it from `API_KEYS` at once and release with a new one. GMs on the release that used it lose
the catalogue until they update.
