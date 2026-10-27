# Using EMMA - Enhanced Module Manager Application

## Requirements

- Foundry VTT version 14 or later.

## Installation

In Foundry's **Add-on Modules** tab choose **Install Module** and paste the manifest URL:

```
https://github.com/Mondarth/EMMA/releases/latest/download/module.json
```

Then enable **EMMA - Enhanced Module Manager Application** in your world under **Manage Modules**.

## Opening EMMA

Once the module is active, the **Manage Modules** button in the Settings sidebar opens the **EMMA - module management**
window instead of Foundry's own Module Management window. Clicking the button again while the window is open brings it
to the front.

If EMMA ever fails to open, you are told so and Foundry's own Module Management window opens instead, so you can always
manage your modules.

## Views

The toolbar at the top of the window switches between two views with the icon buttons on its right. Set apart at its
far right, the double chevron opens or closes every module's drawer (see [Module details](#module-details)).

List view
: Every installed module, with its version, under a title counting how many are active and inactive. Check or
  uncheck a module to activate or deactivate it. Modules you have changed are marked at their left edge.

  The checkbox at the start of the title row shows whether every module is active (checked), none is (unchecked), or
  some are (a dash). Click it to activate every module, or, when every module is active, to deactivate every one,
  EMMA included.

  In the list view only, the toolbar has a **Group related modules** button, just left of the view buttons. While it
  is pressed, related modules are grouped under the modules that relate to them (see
  [Related modules in the list view](#related-modules-in-the-list-view)); press it again for a flat list in
  alphabetical order. EMMA remembers your choice, as it does the view.

Split view
: Inactive modules on the left, active modules on the right, each side's count in parentheses beside its title. Select modules on one side, then move them across with
  the buttons between the lists: **<** deactivates the modules selected on the active side, and **>** activates the
  modules selected on the inactive side. Moved modules stay selected, so the opposite button undoes a move.

In both views each module's version is shown in a badge, in Foundry's own colours and icons, coloured by how well the
module suits your world. Hover over the badge for the reason.

By default the badges show EMMA's checks, made from the installed modules alone, without fetching anything. Each
module is checked against your Foundry version and against the game system and its version, and a module staged
active is also checked against the modules it requires and conflicts with, among those staged active: staging a module
active or inactive checks the others again. Foundry's own Module Management checks only the Foundry version, so it can
show a module as verified that does not work with your game system. To see Foundry's own badges instead, choose
**Foundry VTT's own checks** under **Badge checks** (see [Settings](#settings)); the footer then warns that they may
be inaccurate. Hypothetical mode always judges as EMMA does.

| Badge   | Meaning                                                                                       |
| ------- | --------------------------------------------------------------------------------------------- |
| Green   | Verified for this version of Foundry                                                          |
| Grey    | Verified for this generation of Foundry, but not this build                                   |
| Amber   | Not verified for this generation of Foundry, or not for the active game system                |
| Red     | Incompatible or of unknown compatibility, or missing (or needing updates to) what it requires |

### Selecting in the split view

| To                                   | Mouse                     | Keyboard (with the list focused)       |
| ------------------------------------ | ------------------------- | -------------------------------------- |
| Select one module                    | Click it                  | Arrow keys, **Home**, **End**          |
| Add or remove one module             | **Ctrl**-click (**⌘** on macOS) | **Ctrl**/**⌘** with the arrow keys to move, then **Space** |
| Select a range                       | **Shift**-click           | **Shift** with the arrow keys          |
| Select every module on that side     |                           | **Ctrl**+**A** (**⌘**+**A** on macOS)  |

### Related modules in the list view

When you check a module in the list view:

- **Required modules are checked with it.** So are the modules they require in turn.
- **Related modules are grouped under it,** indented, in place of their usual positions: required modules first, then recommended ones, each in alphabetical order. Each grouped module has an information icon at its left; hover over it to see whether the module is **Required** or **Recommended**.
- **Recommended modules are left unchecked** for you to check if you want them, unless you turn on **Automatically activate/deactivate recommended modules** (see [Settings](#settings)).
- **A module related to several checked modules** appears under each of them. Every copy is the same module, so checking or unchecking one changes them all.

When you uncheck the module, the modules checked only because of it are unchecked again, unless another checked module still needs them, and they return to their usual places. Modules you checked yourself, or that were already active, stay as they are.

A module that a checked module requires cannot be unchecked: its checkbox is dimmed and disabled, and hovering over
it says which modules require it. In the split view, such a module on the active side cannot be selected, so it cannot
be deactivated, and hovering over it says the same. It is released once no active module requires it. Modules that
require each other do not lock one another, so neither is ever stuck.

A module that conflicts with one that is checked is shown in red, with a warning icon whose tooltip reads **Conflict**.

### Related modules in the split view

The split view follows the same rules, with selecting in place of checking:

- **Selecting a module selects the modules it requires** on the same side, following the chain, and groups them under
  it with the modules it recommends, required first. Each grouped module has the same information icon. Deselecting
  the module deselects them again, unless another selected module requires them.
- **Activating moves the required modules with it.** Moving a module to the active side activates what it requires,
  and, with **Automatically activate/deactivate recommended modules** on, what it recommends. Deactivating it
  deactivates the modules activated only for it.
- **Recommended modules wait for you.** While an active module is selected, the modules it recommends that are still
  inactive are grouped under it on the active side, each with a checkbox. Check it to activate that module too;
  uncheck it to change your mind.

A module required by an active module cannot be selected on the active side, and an inactive module that conflicts
with an active one is shown in red with a warning icon, as in the list view.

### Module details

Every module in either view has a disclosure triangle at its far right. Click it to open a drawer below the module
showing its details (by default its description, its authors and the languages it is translated into); click it
again to close the drawer.
Opening a drawer never changes which modules are selected or active, and any number can be open at once. The double
chevron at the far right of the toolbar, as in Foundry's own Module Management, opens every drawer; once they are all
open, it closes them all.

From the keyboard, press the right arrow key to open or close the drawer: in the list view, on the module's triangle or
checkbox, and in the split view, on the module the keyboard is on.

| To                                             | Mouse                    | Keyboard, list view                        | Keyboard, split view (with the list focused) |
| ---------------------------------------------- | ------------------------ | ------------------------------------------ | -------------------------------------------- |
| Open a module's drawer                         | Click its triangle       | **→** on the module's triangle or checkbox | **→** on the module                          |
| Close a module's drawer                        | Click its triangle again | **→** again                                | **→** again                                  |
| Open or close every drawer                     | Click the double chevron | **Tab** to it, then **Enter** or **Space** | **Tab** to it, then **Enter** or **Space**   |
| Open or close a dropdown in the drawer         | Click it                 | **Tab** to it, then **Enter** or **Space** | **Tab** to it, then **Enter** or **Space**   |
| Follow a link in the drawer                    | Click it                 | **Tab** to it, then **Enter**              | **Tab** to it, then **Enter**                |

Authors link to their web pages and email addresses where the module's manifest gives them, and their Discord names
are shown too. Where a module has several of a detail, such as authors or languages, the drawer lists them in a
dropdown, closed to begin with, that names how many there are. A detail the module's manifest does not give is left
out.

#### Choosing the details shown

Each user chooses the details their drawers show: in **Game Settings**, open the section for EMMA, choose **Choose
details** under **Module details**, check the details you want and **Save**. **Reset to defaults** checks the
defaults again. Open drawers change at once, and your choice follows you to every device you play on. Closing the
window with your choice changed and not saved asks first whether to discard the change or keep editing.

| Detail           | Shows                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Description      | The module's description (shown by default)                                                   |
| Authors          | Its authors, with their web pages, email addresses and Discord names (shown by default)       |
| Languages        | The languages it is translated into (shown by default)                                        |
| Links            | Its project page, readme, changelog, bug tracker, licence, manifest and download, as given    |
| Compatibility    | The Foundry versions it declares: minimum, verified and maximum                               |
| Game systems     | The game systems it supports                                                                  |
| Requires         | The packages it requires, with the reasons given                                              |
| Recommends       | The packages it recommends, with the reasons given                                            |
| Conflicts with   | The packages it conflicts with, with the reasons given                                        |
| Compendium packs | Its compendium packs, with the type of document each holds                                    |
| Library          | Whether it is a library, providing features for other modules rather than its own             |
| Module ID        | Its package ID, as used in manifests and URLs                                                 |

EMMA remembers the view you last chose, separately for each user and on every device you play on. The list view is shown
until you choose otherwise.

## Hypothetical mode

GMs have a **Hypothetical mode** button, a flask, at the far left of the toolbar. Click it to turn the mode on; it
stays pressed while on, and two buttons appear just to its right:

- **Core**, showing the Foundry version you are running, such as `14.368`.
- **System**, showing the ID and version of the game system in use, such as `dnd5e 5.1.0`. Hover over it for the
  system's full name.

When you turn the mode on, EMMA looks up the versions of Foundry, the game system and every module staged active, using
[@mondarth/fvtt-resolver](https://www.npmjs.com/package/@mondarth/fvtt-resolver). Only modules staged active are
looked up, so inactive modules show their installed version's badge and no drop-down. While the mode is on, a
module you stage active, by checking it or moving it to the active side, is looked up then: its drop-down appears
after a second or two, once EMMA has found its versions and judged them. Each module is looked up only once while
EMMA is open, so staging it inactive and active again shows its drop-down straight away. A spinner shows beside the
System button while it looks.

### Choosing versions

Once the versions are found, each module staged active that has other versions to choose has its version badge
replaced by a drop-down, in the same colours. A module offers the version installed and every newer one; older
versions are left out, unless you choose to be shown some with the **Show older versions** setting (see
[Settings](#settings)). Click it, or **Tab** to it and
press **Enter**, to list those versions, newest first. The version shown on the badge is left out of the list, and
once you have chosen another version, the installed one is listed too, to go back to. Each version has the badge
Foundry would give it: green when verified for your Foundry version, red when it needs another Foundry version or a module it requires
is missing, and so on. Hover over a version for Foundry's explanation.

Choose a version to see it on the module's badge. Nothing in the world changes: choosing only changes how other
versions are judged. Each version is checked against the core, the system and the modules staged active at their
chosen versions, so staging a module active or inactive judges every badge again: a module whose required module
is staged inactive, for instance, turns red. Modules with no other version have no drop-down, but their badges are
judged the same way, so they change too.

| To                         | Mouse                    | Keyboard, list view                         |
| -------------------------- | ------------------------ | ------------------------------------------- |
| Open a module's versions   | Click its badge          | **Tab** to the badge, then **Enter**        |
| Move through the versions  | Point at a version       | **↑**, **↓**, **Home**, **End**             |
| Choose a version           | Click it                 | **Enter** or **Space**                      |
| Close without choosing     | Click elsewhere          | **Escape**                                  |

In the split view, the badges are mouse-only, as the lists handle the keyboard themselves.

### Choosing the Foundry and system versions

The **Core** and **System** buttons become drop-downs too, marked with a caret, once a newer version of Foundry or of
the game system is found. They open, and are driven from the keyboard, as a module's badge is. Foundry versions are
offered from the release channel of the build you are running or a more stable one: on a stable build, only newer
stable builds; on a testing build, testing builds too.

Each version in these lists is coloured by how well the setup it would make fits: by the worst badge it would leave
the game system or a module staged active with. Hover over a version to see which packages will not work with it, and
which may not. Choose a version to see it on the button; every module's badge is then judged again against it.

### Reporting on the setup

In the middle of the toolbar, three buttons each open a report on the setup hypothetical mode shows: the Foundry
version, the system and the modules staged active, at the versions chosen. They are enabled once the versions are
looked up. Each report opens in a window of its own, so any of them can be open beside the others; a button shows
pressed while its report is open, and pressing it again closes the report:

- **Plan** (a numbered list): the active modules in the order to install them, numbered, in three columns: each
  module's ID, its name, and a manifest URL for the version chosen alone, such as a GitHub release's own
  `module.json`, so that installing from it installs that version. A module's own manifest URL usually gives whatever
  version is newest, so it is never shown; where no source gives a URL for the version, the plan says _none for this
  version_. The proxy lets EMMA find more of them. The plan is in two lists, each under its title and numbered from 1:
  first the modules to install (a version other than the one installed, or a module not installed), then those kept at
  the version installed. In each, a module comes before the modules that depend on it: the modules are ordered by how
  deep the tree of active modules depending on each one goes, deepest first, so the libraries others build on come
  first.
- **Check** (a clipboard with a tick): whether every package can be used in the setup, then every active module with
  its badge, Foundry's verdict and, in words, everything found about it: what keeps it from being used (a module it
  depends on at the wrong version, a system it does not run in), what it prefers and is not given (a Foundry version
  or system version it is not verified with), what it advises (a module it recommends that is not active), and whether
  it is not known, or known only from a listing and so checked without its dependencies.
- **Update** (an arrow up in a circle): the best versions of the active modules for the Foundry version and system
  chosen: the newest version of each, from the one chosen up, that works with the others' and with
  that Foundry version and system. A version that is only a compatibility risk (not verified for this Foundry, but not
  ruled out) is acceptable; one that needs another Foundry version, does not support the system version, or declares
  no compatibility at all is not, nor is a pre-release. It lists the versions to change, and modules an active module
  needs that it would add; or, when no versions work together, explains why in numbered sentences. It may need the
  manifests of versions known only from a listing, which it tries to fetch, so it can take a moment; versions whose
  manifests could not be loaded are named. Without a proxy, versions known only from GitHub cannot be read, so are not
  taken.

When the **Update** changes any version, a button (a wand) just left of its download button chooses the versions it
recommends in the hypothetical setup, as if you had picked each from its drop-down. Every other choice is left as it
is, and nothing in the world changes. A module the update would add, which is not active, is given its version but not
staged active. Every report open then reports on the setup with those versions, without closing its window: the
**Update** is worked out again, and the **Plan** and the **Check**, if open, follow. Only the **Update** works out the
best versions, which may take requests, so opening the **Plan** or the **Check** alone makes none.

The reports consider the version chosen of each package and every newer one, and as many versions before it as
**Show older versions** says: none by default, as installing an older version into an existing world is risky, its data
not always going back, and the oldest versions are the ones most often missing, incomplete or gone. So by default the
**Update** never recommends an older version than the one chosen, and its explanations do not name older versions. A module an active module needs, which is not active, counts from
its installed version, if it is installed. Each report scrolls beneath its buttons, which stay in view.

The download button at the top of each report downloads it as a plain text file (`emma-plan.txt`, `emma-check.txt` or
`emma-update.txt`).

A report is made when it opens, from the setup as it is then. Changing a version, the Foundry version or the system,
or staging a module active or inactive, while it is open does not change it: it still reports on the setup it was
opened on. To report on the setup as it is now, press its button twice, closing it and opening it afresh. The one
exception is the **Update**'s button that chooses the versions it recommends: every report open then follows the
versions it chose. Leaving hypothetical mode, or closing EMMA, closes every report, as the setup they report on goes
with it.

### Where versions come from

Browsers may not read Foundry's own package listing, its release notes, or the manifests attached to GitHub
releases, because those sites send no CORS headers, so EMMA looks versions up through a CORS proxy: its own, unless a
GM chooses another (see [Settings](#settings)). Through a proxy, EMMA reads Foundry's package listing and release
notes, so each version is judged on the Foundry versions it declares, and newer Foundry builds are offered.

With EMMA's own lookup, EMMA first asks its [package catalogue](https://github.com/Mondarth/fvtt-package-catalogue),
which keeps every version of the packages asked for, each read from its own manifest, with what they require and run in.
One request gives them all, so lookups are much quicker. A package the catalogue does not have yet it fetches, for next
time, and EMMA looks it up through the proxy meanwhile; if the catalogue cannot be reached, EMMA looks everything up
through the proxy, as before.

The catalogue also keeps versions an author has published ahead of Foundry's package listing, such as releases on
GitLab not yet on the listing. EMMA offers them marked with a flask, and their tooltip says they are not on Foundry's
package listing: Foundry's own installer does not offer them, so choose one knowingly.

The catalogue also knows which packages cannot be had: those whose Foundry listing is **archived**, which Foundry's
Setup screen no longer offers (often because the author removed them), and those the catalogue's maintainers found
**gone**, their files no longer available. Hypothetical mode never looks such a module up or judges it, and leaves it
out of the setup it reports on, so a module that requires it shows that requirement as not met. Every report ends with
a **Not available** section naming each active module that cannot be had, and why. A module hypothetical mode ignores
(see [below](#modules-hypothetical-mode-ignores)) is taken as present instead, and not named there.

Without a proxy, EMMA lists the versions released on GitHub and GitLab, but does not know which Foundry versions
those releases support, so Foundry marks them **Compatibility unknown**; and as it cannot read Foundry's release
notes, it offers no newer Foundry version. A note in the footer says so while the mode is on. A warning beside the System button names the packages that could not be looked up. An old version
whose manifest cannot be read is still listed, but does not raise the warning.

### Staging in hypothetical mode

Hypothetical mode is for trying setups out, so nothing in it is saved:

- **Save** is disabled while the mode is on.
- **Reset** undoes everything done in the mode, both the modules staged or unstaged and the versions chosen, and
  restores what was staged when you turned the mode on, including changes you staged before it. You stay in the mode.
- Turning the mode off, by clicking the flask again, does the same: everything done in it is discarded, and what you
  had staged before is back, ready to save. The versions looked up are kept until EMMA closes, so turning the mode on
  again does not look them up again.
- Closing EMMA while the mode is on asks first only if you had staged changes before turning it on; what was staged in
  the mode is discarded without asking.

Hypothetical mode is not remembered: it is off each time EMMA opens. Players are not offered it.

### Modules hypothetical mode ignores

Very rarely a module has no manifest EMMA can read, such as one made by hand rather than installed from a release.
Hypothetical mode can never look its versions up, so it would always find it a problem. Rather than deactivate it to
try a setup and activate it again afterwards, have hypothetical mode ignore it: right-click its row, in either view, and
choose **No hypotheticals**.

While the mode is on, an ignored module is greyed out, and its tooltip says why. Hypothetical mode never looks it up or
judges it, and leaves it out of the reports, but takes it as present at its installed version, so the modules that
require it are satisfied, whatever version of it they ask for. Every report names the modules it leaves out, and warns that it may be inaccurate: whether
they suit the setup is not known. It can still be activated and deactivated as usual. To have the mode consider it again,
right-click its row and choose **Add to hypotheticals**.

The modules ignored are shared by the world's GMs, and kept until a GM adds them back. Players are not offered the menu.

## Saving

Changes you make in either view are staged, not applied: the footer counts them, and modules you have changed are
marked. **Save** applies them and asks to reload the world, which they need to take effect; every connected player
reloads with you. **Reset** discards them. Closing the window with changes staged asks first whether to discard them
or keep editing.

A module that requires other modules can only be saved as active together with them. EMMA keeps them active while it
is, but if the world was saved with one missing, or a required module is not installed, the footer names it and
**Save** stays disabled.

If your changes would deactivate EMMA itself, the footer warns you: once saved, the **Manage Modules** button opens
Foundry's own Module Management window instead, from which you can activate EMMA again.

Only a GM or assistant GM with permission to modify configuration settings can save. Everyone else sees EMMA read-only.

## Settings

Disable EMMA
: A world setting, changed by the GM under **Game Settings**. When checked, the **Manage Modules** button opens
  Foundry's own Module Management window again. It takes effect immediately, without reloading.

Automatically activate/deactivate recommended modules
: A setting for each GM, off by default; players are not offered it, as only GMs change which modules are active. When
  on, activating a module, by checking it in the list view or moving it to the active side of the split view, also
  activates the modules it recommends, and deactivating it deactivates them again, as it does for required modules.

Badge checks
: A setting for each user: whose checks the version badges show outside hypothetical mode. **EMMA's checks** (the
  default) judge each module against the Foundry version and the game system and its version, and an active module
  against what it requires and conflicts with; **Foundry VTT's own checks** judge the Foundry version alone, as
  Foundry's Module Management does, so may be inaccurate, which the footer says while they are shown. A change shows at
  once.

Show older versions
: A setting for each GM, under **Game Settings**: how many versions before the one installed hypothetical mode offers in
  each version drop-down, and its reports consider, from 0 (the default) to 20. Older versions are rarely safe to
  install into an existing world, but one or two let you try rolling an update back: say a module update brought a
  change you dislike. Set this to 1, choose the version before in hypothetical mode and run the **Check**. If it finds
  no problems, install that version from the manifest URL in the **Plan**, and restore the world from the backup you
  made before updating. Each version shown is judged against every other, so showing many older versions can make
  hypothetical mode noticeably slower. A change applies the next time versions are judged, such as when you next open
  a drop-down or a report. Players are not offered it, as only GMs have hypothetical mode.

Module details
: A menu every user can open under **Game Settings**, choosing the details their drawers show for themselves. See
  [Module details](#module-details).

Version lookup proxy
: A menu under **Game Settings** for GMs only (Foundry shows it only to users who may change configuration
  settings). Its **Set proxy** button opens a window to choose what hypothetical mode looks versions up through,
  shared by the whole world:

  - **EMMA's proxy** (the default): EMMA's package catalogue first, then a proxy run for EMMA for anything the
    catalogue does not have yet. Both deal only in package information (release lists, release downloads, manifests
    and Foundry's package listing) and cache it, so lookups are quick and stay within GitHub's limits. They see your
    server's address and the packages it looks up. Their addresses and keys are built into EMMA and never shown. A
    world that set its own proxy before there was a choice keeps it.
  - **My own proxy**: a CORS proxy you run or trust, with two fields:
    - **Proxy URL**, with `{url}` where the address to fetch goes, such as `https://proxy.example.com/?url={url}`.
      Every request hypothetical mode makes is sent through it, so use only a proxy you trust. The window will not
      save it without `{url}`.
    - **API key**, sent to the proxy in an `X-API-Key` header, for a proxy that asks for one. It is kept only in the
      browser it is entered in, as Foundry sends every world and user setting to every user who joins, where any
      player could read it. Each GM enters it once on each browser they use. EMMA's own key is never sent to your
      proxy.
  - **No proxy**: versions are looked up directly. Before saving, EMMA asks whether you are sure, as this greatly
    reduces what hypothetical mode can do: it can read only GitHub's and GitLab's release lists and the manifests
    installed modules came with, so it finds far fewer versions, offers no newer Foundry version, and judges many
    versions without knowing which Foundry or system they suit. GitHub also allows only 60 lookups an hour from your
    browser's address.

  Only EMMA's own lookup asks EMMA's catalogue: with your own proxy, or none, EMMA never contacts it.

  Every request through a proxy, EMMA's or your own, carries EMMA's version in an `X-EMMA-Version` header, so the
  proxy's logs can tell which version asks for what; requests to EMMA's catalogue carry it in `X-Catalogue-Client`.
  Requests without a proxy carry nothing extra.

  See [Where versions come from](#where-versions-come-from).

## The API

The module has no public API yet.
