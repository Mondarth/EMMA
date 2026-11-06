# The default catalogue

EMMA looks up versions in a default package catalogue, built into every release: the
[Foundry VTT package catalogue](https://github.com/Mondarth/fvtt-package-catalogue), which asks for an API key. It is
the only service EMMA asks for versions, from the module and from the EMMA extension alike. Earlier versions also
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
- **Directly.** The catalogue sends CORS headers, so the browser asks it itself, with its key in `X-API-Key`.
- **Without it.** A build without a catalogue, or a catalogue that cannot be reached, leaves EMMA knowing only what is
  installed, and saying so.

## What protects it

The key ships inside every release of EMMA, and the browser sends it with every lookup: any GM can read it in the
browser's network tab. It cannot be kept secret, so it is not what protects the catalogue. It only says which client
is asking. What protects the catalogue is that it is of little use for anything else: the data it gives is public
package information, it serves nothing else, and its rate limits bound what any one caller can cost. So a key that
leaks lets someone read public Foundry package information, a little faster than they could anyway.

## How the key is built in

The release workflow sets two values in the environment of the release build:

`EMMA_DEFAULT_CATALOGUE_URL`
: A repository variable: the catalogue's `https` URL.

`EMMA_DEFAULT_CATALOGUE_KEY`
: A repository secret: the API key.

`packages/core/scripts/default-catalogue-define.ts` gives both to Vite's `define` as `__EMMA_DEFAULT_CATALOGUE__`,
obscured by `packages/core/src/obscure.ts`: each is split into chunks, and each chunk masked by random bytes of its
own, so neither the key nor any long run of it is in the bundle as text. The pads are new with every build. It is not
encryption, as the pads ship beside the chunks; it keeps the key out of casual sight, and out of a search of the code.
EMMA reveals it when it uses it, with `defaultCatalogue()` (`src/module/lib/default-catalogue.ts`, through
`packages/core/src/default-catalogue.ts`). The EMMA extension is built with it in the same way, in the browser
extension's release step.

The build stops when only one of the two is set, or when the URL is not `https`. After building, the release, of the
module and of the browser extension, refuses to package a bundle that holds the key in plain text anywhere. A release
stops, before it changes anything, when either is not set (`packages/core/scripts/release-defaults.ts`). Development,
CI and test builds need neither, so have no catalogue unless they are set, and the unit tests always run without one.
The end-to-end tests build in a made-up catalogue, which they answer themselves (see `.github/workflows/e2e.yml`).

## Rotating the key

Give each release a new key, and keep the catalogue accepting the keys of the releases still in use. The catalogue's
`API_KEYS` is a list, so a key can be added before a release and removed once no one uses that release any more.

1. Make a new key: `openssl rand -hex 32`.
2. Add it to the catalogue's `API_KEYS`, keeping the current one, and restart the catalogue.
3. Set it as the `EMMA_DEFAULT_CATALOGUE_KEY` secret: `gh secret set EMMA_DEFAULT_CATALOGUE_KEY --repo Mondarth/EMMA`,
   pasting the key alone.
4. Release. The new release uses the new key; earlier ones keep using theirs. The module and the browser extension
   are released apart, and each release of either takes the key set when it is built, so a key is in use until the
   releases of both that have it are rarely seen.
5. Once the release before last is rarely seen (the catalogue's logs give each request's `X-Catalogue-Client`), remove
   its key from `API_KEYS`. Keeping two or three keys gives GMs time to update.

If a key is abused, remove it from `API_KEYS` at once and release with a new one. GMs on the release that used it lose
the catalogue until they update.
