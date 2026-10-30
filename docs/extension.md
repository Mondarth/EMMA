# The browser extension (alpha)

EMMA runs inside a world, but some of its work belongs outside any world: seeing every world on a Foundry VTT server at
once, and which modules each one runs, before launching any of them. That happens on Foundry's setup screen, which
modules cannot change. So EMMA comes with a browser extension that adds EMMA to the setup screen, on the servers you
choose.

:::{warning}
The extension is an **alpha**, for testing. It is not listed in the Chrome Web Store or on Firefox Add-ons; you install
it by hand, as described below. For now it only shows the installation: it does not install or update anything.
:::

## Requirements

- A Chromium browser (Chrome, Edge, Brave, Vivaldi, Opera…), version 102 or later, or Firefox 128 or later. Safari is
  not supported yet.
- A Foundry VTT server, version 14 or later, whose setup screen you can open: you need its administrator password.
- EMMA 0.9 or later active in the worlds you want to see in detail (see [worlds without a record](#worlds-without-a-record)).

## Installing

Each alpha is published as a pre-release on GitHub, named **EMMA browser extension &lt;version&gt; (alpha)**. Find the
newest on the [EMMA releases page](https://github.com/Mondarth/EMMA/releases?q=extension&expanded=true).

### Chrome, Edge and other Chromium browsers

1. Download `emma-extension-chromium-v<version>.zip` from the release.
2. Unzip it into a folder you will keep. The browser loads the extension from that folder each time it starts, so do
   not delete or move it.
3. Open the extensions page: `chrome://extensions` in Chrome, `edge://extensions` in Edge.
4. Turn on **Developer mode**.
5. Choose **Load unpacked** and select the folder.
6. Pin **EMMA for Foundry VTT (alpha)** to the toolbar, from the extensions (puzzle piece) menu, so its button is at
   hand.

Some browsers remind you at start-up that an extension in developer mode is installed. That is expected of an extension
installed by hand.

To update, download the newer zip, replace the folder's contents with it, and choose the reload button on EMMA's card on
the extensions page.

### Firefox

1. Download `emma-extension-firefox-v<version>.xpi` from the release.
2. Open the file in Firefox: drag it onto a Firefox window, or choose it from **File → Open File**.
3. Choose **Add** when Firefox asks.

The file is signed by Mozilla, so Firefox keeps the extension installed, but it is not listed on Firefox Add-ons. To
update, install the newer `.xpi` the same way.

If a release has only `emma-extension-firefox-v<version>-unsigned.zip`, Firefox can load it only until it restarts:
unzip it, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and select the
`manifest.json` inside.

## Activating EMMA on a server

Installing the extension gives it no access to any site. You allow it, server by server:

1. Open your server's setup screen and log in as the administrator.
2. Choose the extension's button in the browser's toolbar. It shows the server's address.
3. Choose one of:
   - **Activate on this server**: the browser asks whether to let the extension read and change the server's pages.
     Allow it, and EMMA opens on the setup screen now, and by itself each time you open this server's setup screen.
   - **Open EMMA just this once**: EMMA opens on this setup screen now, without any lasting permission. Nothing is
     remembered, and next time you choose the button again.

Firefox cannot limit a permission to one port of a server. On Firefox, allowing `http://localhost:30000` allows every
port of `localhost`; EMMA still opens by itself only on the server you activated.

### Choosing how EMMA opens

Once a server is activated, the extension's button offers:

- **Open EMMA by itself on this server's setup screen**: clear it to have EMMA open only when you choose **Open EMMA
  now**.
- **Forget this server**: forgets the server, and gives up the permission to read and change its pages.

**Manage servers** lists every server EMMA is active on, with the same choices.

## On the setup screen

With EMMA open, the setup screen changes in two ways.

**EMMA's button** joins the menu at the top of the screen, beside Foundry's own. It opens EMMA's window.

**Foundry's own installs and updates are disabled**: the **Install** button, **Update All**, and the update button on
each package are greyed out, and say that EMMA manages packages on this screen if chosen. That keeps packages from
changing behind EMMA's back. Uninstalling packages, and creating and launching worlds, are not affected. To let Foundry
install and update packages again, select the root of EMMA's tree and check **Let Foundry install and update packages
here**. The browser remembers the choice for that server.

### The installation tree

EMMA's window shows the installation as a tree, and beside it what is selected in it. The tree is in two halves, the
game systems with the worlds that use them, and the modules:

```text
Foundry VTT
  Game systems
    D&D 5e
      World 1
        the modules World 1 runs
      World 2
        the modules World 2 runs
    Pathfinder 2e
      World 3 …
  Modules
    Universal
      the modules for any game system
    D&D 5e
      the modules for D&D 5e
```

- **The root**, Foundry VTT and its version: a summary of the worlds (how many, by game system, and how their records
  compare with what is installed) and of the modules (how many, and how many a recorded world runs).
- **Game systems**: each installed system, with its version and the worlds that use it, and any system a world uses that
  is not installed, marked **Not installed**. Each world shows how its record compares with what is installed now:
  - **Matches its record**: Foundry, the game system and every module are installed at the versions the world last ran
    with.
  - **Changed since it last ran**: something has been updated or uninstalled since. The world's panel lists what.
  - **No record**, or **Record unreadable**: see below.
- **Under each world**, the modules it runs, with the version it last ran with and whether that version is installed,
  another version is, or none is.
- **Modules**: every installed module, grouped by the game systems its manifest names. **Universal** holds the modules
  that name none, for use with any system. A module for several systems is in each of their groups.
- **Under each module**, wherever it shows, the modules it requires, and under those the modules they require in turn.
  A requirement that is not installed is marked **Not installed**.

So a module may show in many places. Its panel is the same wherever it is selected: the version installed, the game
systems it is for, the modules it requires and those that require it, and the recorded worlds that run it; under a
world, also the version that world last ran with.

Every row with rows under it opens and closes, from its triangle or from the keyboard: the arrow keys move up and down,
and open and close a row, and Home and End go to the first and last row. **Read again** reads the installation afresh.

### Worlds without a record

EMMA learns which modules a world runs from the record EMMA keeps in the world's folder (see
[The world record](usage.md#the-world-record)). A world that has not been opened with EMMA 0.9 or later active has no
record yet, and is marked **No record**: open it once, with EMMA active, and EMMA records its setup. A world whose
record cannot be read is marked **Record unreadable**; opening it with EMMA active records it again.

## Privacy

The extension sends nothing anywhere. It reads the setup screen of the servers you allow it on, and the world records
in their worlds' folders, through the server's own pages. It keeps the list of servers you activated, and the choice of
whether EMMA opens by itself on each, in your browser.

## Limitations of the alpha

- EMMA only shows the installation on the setup screen. Checking worlds for compatibility, and installing or updating
  packages from EMMA, are to come.
- EMMA disables Foundry's package buttons only in a browser where the extension is installed and has opened EMMA. It
  cannot stop installs from other browsers.
