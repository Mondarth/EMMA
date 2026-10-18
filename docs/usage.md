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

Split view
: Inactive modules on the left, active modules on the right, each side's count in parentheses beside its title. Select modules on one side, then move them across with
  the buttons between the lists: **<** deactivates the modules selected on the active side, and **>** activates the
  modules selected on the inactive side. Moved modules stay selected, so the opposite button undoes a move.

In both views each module's version is shown as Foundry's own Module Management shows it: in a badge coloured by
how compatible the module is with your version of Foundry. Hover over the badge for the reason.

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

## Saving

Changes you make in either view are staged, not applied: the footer counts them, and modules you have changed are
marked. **Save** applies them and asks to reload the world, which they need to take effect; every connected player
reloads with you. **Reset** discards them. Closing the window with changes staged asks first whether to discard them
or keep editing.

A module that requires other modules can only be saved as active together with them. While one is missing, the footer
names it and **Save** stays disabled.

Only a GM or assistant GM with permission to modify configuration settings can save. Everyone else sees EMMA read-only.

## Settings

Disable EMMA
: A world setting, changed by the GM under **Game Settings**. When checked, the **Manage Modules** button opens
  Foundry's own Module Management window again. It takes effect immediately, without reloading.

Module details
: A menu every user can open under **Game Settings**, choosing the details their drawers show for themselves. See
  [Module details](#module-details).

## The API

The module has no public API yet.
