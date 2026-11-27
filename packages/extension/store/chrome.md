# Chrome Web Store

The Developer Dashboard's fields for the item, in the order its tabs ask for them. Choices the dashboard offers as
lists are given as they are named there; check them against the dashboard, which changes them from time to time.

## Package

- **Upload:** `emma-extension-chromium-v<version>.zip` from the release, 0.16.0 or later.
- **Name** (from the manifest): EMMA for Foundry VTT

## Store listing

- **Summary** (from the manifest's `description`, 132 characters at most):
  > Brings EMMA, the Enhanced Module Manager Application, to Foundry VTT's setup screen, on the servers you choose.
- **Description:** [`description.md`](description.md).
- **Category:** Tools. (Developer Tools also fits; Games does not, as EMMA is no game.)
- **Language:** English.
- **Icon:** 128 × 128, `public/icons/emma-128.png`.
- **Screenshots** (1280 × 800, or 640 × 400; one at least, five at most), still to be taken, on a server with a few
  worlds:
  1. The installation tree beside a module's panel, an update available.
  2. A version list open, its badges, and why the plan takes the version it does.
  3. The update plan, with its backups and snapshot, before running.
  4. A plan running: its steps' progress.
  5. The Install section: Foundry's listing, filtered, a module's drawer open.
- **Small promo tile** (440 × 280): optional, unless the item is to be featured.
- **Official URL:** none (it needs a site verified in Search Console; mondarth.com could be, later).
- **Homepage URL:** https://mondarth.github.io/EMMA/extension.html
- **Support URL:** https://github.com/Mondarth/EMMA/issues
- **Mature content:** No.

## Privacy practices

### Single purpose

> EMMA manages the game systems, modules and Foundry VTT version of a Foundry VTT server from its setup screen: it
> shows what is installed and what each world uses, finds updates and packages to install, and installs, updates and
> uninstalls them through Foundry's own installer.

### Permission justifications

- **storage:**
  > Keeps, in the browser, the servers the user activated EMMA on, whether EMMA opens by itself on each, the sizes of
  > its panels, and the user's sign-in to EMMA's package catalogue.
- **scripting:**
  > Adds EMMA to the setup screen of a Foundry VTT server the user activated it on: it runs the extension's own
  > scripts, packaged with it, in that page. It runs nothing on any other page.
- **activeTab:**
  > Lets the user activate EMMA on the Foundry VTT server in the current tab, from the toolbar button, before EMMA
  > asks for that server's host permission.
- **Host permissions** (`http://*/*`, `https://*/*`, optional, never granted at install):
  > Foundry VTT servers are self-hosted, at any address, over http or https. EMMA asks for the host permission of each
  > server only when the user activates EMMA on it, and has access to no site until then. It needs it to open EMMA on
  > that server's setup screen each time, and to read its world records.

### Remote code

**No, I am not using remote code.** From 0.16.0, everything the extension runs is in its package (the setup kit is
built in). It fetches only data: the catalogue's answers, and the server's own setup page and world records.

### Data usage

What the extension collects, that is, sends off the user's device, as the dashboard's categories name it:

| Category                            | Collected | What                                                                                                                                                                                                                                     |
| ----------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | No        |                                                                                                                                                                                                                                          |
| Health information                  | No        |                                                                                                                                                                                                                                          |
| Financial and payment information   | No        | Subscriptions are bought on Mondarth's accounts site, not in the extension.                                                                                                                                                              |
| Authentication information          | **Yes**   | The user's sign-in token to EMMA's catalogue, sent with each request to it.                                                                                                                                                              |
| Personal communications             | No        |                                                                                                                                                                                                                                          |
| Location                            | No        |                                                                                                                                                                                                                                          |
| Web history                         | No        |                                                                                                                                                                                                                                          |
| User activity                       | No        |                                                                                                                                                                                                                                          |
| Website content                     | **Yes**   | The IDs, versions and manifest URLs of the game systems and modules installed on the user's Foundry VTT server, read from its setup screen, and a manifest URL the user gives to install from, sent to EMMA's catalogue to find updates. |

**Certifications** (all three, which are true):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://accounts.mondarth.com/privacy

## Distribution

- **Visibility:** Public (or Unlisted, to share by link before going public).
- **Regions:** all.
- **Payments:** free. The extension costs nothing; the catalogue's subscription is sold outside the store, which the
  description says.
