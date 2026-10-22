# EMMA - Enhanced Module Manager Application

[![Dev CI](https://github.com/Mondarth/EMMA/actions/workflows/dev.yml/badge.svg?branch=dev)](https://github.com/Mondarth/EMMA/actions/workflows/dev.yml)
[![Release](https://github.com/Mondarth/EMMA/actions/workflows/release.yml/badge.svg)](https://github.com/Mondarth/EMMA/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/Mondarth/EMMA/branch/dev/graph/badge.svg)](https://codecov.io/gh/Mondarth/EMMA)
[![Latest release](https://img.shields.io/github/v/release/Mondarth/EMMA)](https://github.com/Mondarth/EMMA/releases/latest)
[![Foundry VTT version](https://img.shields.io/badge/Foundry%20VTT-v14%2B-ff6400)](https://foundryvtt.com)
[![Licence](https://img.shields.io/github/license/Mondarth/EMMA)](LICENSE)

Replaces Foundry's Module Management window with one that is easier to work with, and lets GMs try out other versions
of Foundry, the game system and their modules before changing anything.

A module for [Foundry VTT](https://foundryvtt.com) version 14 and later. Install it from the manifest URL:

```
https://github.com/Mondarth/EMMA/releases/latest/download/module.json
```

## Features

Managing modules:

- **Opens in place of Module Management** from the Settings sidebar's **Manage Modules** button. If EMMA ever fails to
  open, Foundry's own window opens instead, and a setting switches back to it at any time.
- **Two views**: a list with a checkbox per module, and a split view of inactive and active modules, with buttons to
  move a selection across. Both can be driven from the keyboard.
- **Compatibility badges** on every version, coloured and explained exactly as Foundry's own.
- **Related modules handled for you**: activating a module activates what it requires, and groups its required and
  recommended modules under it. A required module stays locked while it is needed, and conflicts are shown in red.
  Recommended modules can be activated with it automatically, if you choose.
- **Module details** in a drawer under each module: description, authors, languages, links, relationships and more,
  each user choosing which to show.
- **Staged changes**: nothing changes until you save. The footer counts what is staged, names any requirement still
  missing, warns before EMMA deactivates itself, and asks before closing with changes unsaved. Saving reloads the
  world for everyone. Players see EMMA read-only.

Hypothetical mode, for GMs:

- **Try other versions** without changing anything. Each module with a newer version gets a drop-down of them, each
  in the colour of the badge it would have. Newer Foundry builds and game system versions can be chosen the same way.
- **Everything is judged together**: choosing a version, or staging a module, judges every module again in the setup
  you have made, with Foundry's own verdicts.
- **Reports on the setup**, which can be downloaded as text:
  - **Plan**: the modules to install and those to keep, in the order to install them, each with a manifest URL for
    that version alone.
  - **Check**: every active module, with its verdict and, in words, everything that keeps it from working.
  - **Update**: the newest version of each active module that works with the others and with the Foundry version
    and system chosen, or why there is none. One click chooses those versions.
- **Safe to explore**: saving is disabled while the mode is on. Reset, or leaving the mode, restores what was staged
  before you entered it.
- **Looks further through a proxy**: versions are looked up on GitHub, GitLab and the URLs manifests declare, through
  EMMA's own CORS proxy, which also reads Foundry's package listing and its release notes. GMs can choose a proxy of
  their own instead, protected by an API key kept in their own browser, or none, at the cost of far fewer versions.

For details refer to the [detailed documentation](https://mondarth.github.io/EMMA/). To work on the module, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## AI Disclosure

This project was scaffolded with [create-fvtt-module](https://github.com/ulenarofmondarth/create-fvtt-module). The
tooling and configuration it started from were written in part with AI assistance (Claude Opus 5.5) and reviewed by a
human.

Development of the module itself continues with AI assistance (Claude Opus 5.5). All changes, whether written by a
person or with AI assistance, are reviewed by a human before they are merged.
