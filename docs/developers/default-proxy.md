# The default proxy

EMMA looks up versions through a CORS proxy. A GM can set their own; without one, a release uses a default proxy, built
in. That proxy is a [Foundry VTT Package CORS Proxy](https://github.com/ulenarofmondarth/fvtt-package-corsproxy) that
asks for an API key.

## What protects it

The key ships inside every release of EMMA, and the browser sends it, in an `X-API-Key` header, with every lookup: any
GM can read it in the browser's network tab. It cannot be kept secret, so it is not what protects the proxy. It only
keeps out traffic that is not EMMA's. What protects the proxy is that it is of little use for anything else:

- it proxies `GET` requests only, and never forwards a body;
- its `ALLOWED_HOSTS` and `ALLOWED_URLS` limit it to the URLs EMMA fetches: release lists, release downloads, package
  manifests and Foundry's package listing;
- its rate limit, daily request limit and response cache bound what any one caller, or all of them, can cost;
- its GitHub token can read public repositories only.

So a key that leaks lets someone read public Foundry package information, a little faster than they could anyway.

## How the key is built in

The release workflow sets two values in the environment of the release build:

`EMMA_DEFAULT_PROXY_URL`
: A repository variable: the proxy's URL template, `https://…/?url={url}`.

`EMMA_DEFAULT_PROXY_KEY`
: A repository secret: the API key.

`scripts/build/default-proxy.ts` gives both to Vite's `define` as `__EMMA_DEFAULT_PROXY__`, obscured by
`src/module/lib/obscure.ts`: each is split into chunks, and each chunk masked by random bytes of its own, so neither the
key nor any long run of it is in the bundle as text. The pads are new with every build. It is not encryption, as the
pads ship beside the chunks; it keeps the key out of casual sight, and out of a search of the code. EMMA reveals it
when it uses it, with `defaultProxy()` (`src/module/lib/default-proxy.ts`).

The build stops when only one of the two is set, or when the URL is not `https` or has no `{url}`. After building, the
release refuses to package a bundle that holds the key in plain text anywhere. Development, CI and test builds have
neither, so have no default proxy, and the unit tests always run without one.

## Rotating the key

Give each release a new key, and keep the proxy accepting the keys of the releases still in use. The proxy's
`API_KEYS` is a list, so a key can be added before a release and removed once no one uses that release any more.

1. Make a new key: `openssl rand -hex 32`.
2. Add it to the proxy's `API_KEYS`, keeping the current one, and restart the proxy.
3. Set it as the `EMMA_DEFAULT_PROXY_KEY` secret: `gh secret set EMMA_DEFAULT_PROXY_KEY --repo Mondarth/EMMA`, pasting
   the key alone.
4. Release. The new release uses the new key; earlier ones keep using theirs.
5. Once the release before last is rarely seen (the proxy's logs say which versions call it, with
   `CLIENT_VERSION_HEADER=X-EMMA-Version`), remove its key from `API_KEYS`. Keeping two or three keys gives GMs time to
   update.

If a key is abused, remove it from `API_KEYS` at once and release with a new one. GMs on the release that used it lose
the default proxy until they update.
