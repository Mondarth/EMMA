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

The toolbar at the top of the window switches between two views with the icon buttons on its right:

List view
: Every installed module, with its version and authors. Check or uncheck a module to activate or deactivate it.
  Modules you have changed are marked at their left edge.

Split view
: Inactive and active modules side by side. Coming soon.

EMMA remembers the view you last chose, separately for each user and on every device you play on. The list view is shown
until you choose otherwise.

Changes you make are staged, not saved: saving them, which reloads the world, is coming in a later version. Closing the
window discards them.

## Settings

Disable EMMA
: A world setting, changed by the GM under **Configure Settings**. When checked, the **Manage Modules** button opens
  Foundry's own Module Management window again. It takes effect immediately, without reloading.

## The API

The module has no public API yet.
