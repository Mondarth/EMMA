# Store listings

What the Chrome Web Store and addons.mozilla.org (AMO) ask for to list the browser extension, kept here so that it is
reviewed like code, and so that the release can submit it.

| File                                     | For                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| [`chrome.md`](chrome.md)                 | The Chrome Web Store's store listing and privacy practices tabs, field by field.     |
| [`amo.md`](amo.md)                       | AMO's listing, its notes to reviewers and its source code instructions.              |
| [`amo-metadata.json`](amo-metadata.json) | The same AMO listing, for `web-ext sign --channel listed --amo-metadata` or the API. |
| [`description.md`](description.md)       | The long description both stores show, in plain text with light formatting.          |

## Before submitting

- **Version:** 0.16.0 or later only. Earlier versions import code from the server (the setup kit), which both stores
  refuse, and call themselves alpha.
- **Screenshots** are each release's, attached to its GitHub release.
- **Support e-mail:** both stores ask for one. None is given here; add the address you want public.
- **Keep the data declarations true.** If what the extension sends changes, change `chrome.md`'s privacy answers,
  the Firefox manifest's `data_collection_permissions` (`scripts/manifest.ts`) and `amo.md` with it.
