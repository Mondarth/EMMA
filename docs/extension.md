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
        the game system and the modules World 1 last ran with
      World 2
        the game system and the modules World 2 last ran with
    Pathfinder 2e
      World 3 …
  Modules
    Universal
      the modules for any game system
    D&D 5e
      the modules for D&D 5e
```

- **The root**, Foundry VTT and its version: a summary of the worlds (how many, by game system, and how their records
  compare with what is installed) and of the modules (how many, and how many are active in a recorded world).
- **Game systems**: each installed system, with its version marked **Installed**, and the worlds that use it; then any
  system a world uses that is not installed, marked **Not installed**. Only one version of a system is installed at a
  time. Each world shows how its record compares with what is installed now:
  - **Matches its record**: Foundry, the game system and every module are installed at the versions the world last ran
    with.
  - **Changed since it last ran**: something has been updated or uninstalled since. The world's panel lists what.
  - **No record**, or **Record unreadable**: see below.
- **Under each world**, first its game system, then the modules it runs, each with the version the world last ran with
  and whether that version is **Installed**, **Another version installed**, or **Not installed**. So a world that last
  ran with an older version of its system, or with a system since uninstalled, says so. A world without a record shows
  nothing under it, as EMMA cannot tell what it last ran with.
- **Modules**: every installed module, grouped by the game systems its manifest names. **Universal** holds the modules
  that name none, for use with any system. A module for several systems is in each of their groups.
- **Under each module**, wherever it shows, the modules it requires, and under those the modules they require in turn.
  A requirement that is not installed is marked **Not installed**.

A game system's panel gives the version installed, how many modules are for it, and the worlds that use it, each with
the version it last ran with; under a world, also the version that world last ran with.

So a module may show in many places. Its panel is the same wherever it is selected: the version installed, the game
systems it is for, the modules it requires and those that require it, and the recorded worlds it is active in; under a
world, also the version that world last ran with.

A world's record lists the modules it ran with last time. If a module it runs has been updated since, and the new
version requires a module the world did not run, **Active in** still lists the world, with a note that it will need that
module when next run, and which updated modules require it. The world's panel lists the modules it will need, under
**Will need when next run**, and the root's summary counts them as active in a recorded world, saying how many only will
be.

Every row with rows under it opens and closes, from its triangle or from the keyboard: the arrow keys move up and down,
and open and close a row, and Home and End go to the first and last row. **Read again** reads the installation afresh.

### Updates

As soon as EMMA has read the installation, it looks for newer versions of the installed game systems and modules. The
footer says how many it found. Each package with an update has a blue upward arrow in a circle to the left of its rows
in the tree. A package with a newer version that EMMA cannot offer has a red one beside it, and its panel says which
version, and which worlds hold it back and why: EMMA cannot make every world that uses the package consistent with it. A
closed row with either kind of package anywhere under it has the same arrow, fainter, so nothing is hidden.

Looking for updates needs the EMMA module installed, as the extension uses the module's own code to work them out.
Without it, the footer says so and offers **Install the EMMA module**, which installs it from its published manifest,
through Foundry, even while EMMA guards Foundry's own Install buttons; Foundry then asks whether to install the
module's dependencies, such as libWrapper. An EMMA module too old for the extension is offered **Update the EMMA
module** in the same way. An EMMA module newer than the extension knows of needs a newer extension: the footer links to
its releases. Everything else EMMA shows works without the module.

EMMA offers a package only versions that are safe for every world that uses it, as Foundry installs one version of a
package for all of them:

- For each world with a record, EMMA works out the best setup of the installed Foundry VTT, the world's game system and
  the modules its record says are active, each moved up to the newest version that works with the others. A package is
  offered the newest version that every world using it can take. If EMMA finds no working setup for a world, nothing
  that world uses is offered an update, and the footer says so.
- The game system of a world without a record is not offered an update, as EMMA cannot tell whether the modules the
  world runs would work with one.
- A package no world with a record uses, such as a module that no world has active, is offered its newest version that
  the installed Foundry VTT can run.

Foundry VTT itself is offered an update too, on the tree's root row: the newest stable build that every world with a
record can take, with its game system and modules free to move up as well. A world without a record holds Foundry VTT
to the builds its installed game system runs on, and a world for which EMMA finds no working setup holds it where it
is. Its versions are coloured by how well the recorded worlds' packages fit each build, naming those that will not work
with it and those not verified with it. Foundry's builds come from its release notes, which only EMMA's proxy can read;
without the proxy, Foundry VTT is not offered an update.

A version that needs other packages to change with it, or a newer Foundry VTT, is still offered if they can all change
together and every world that uses them keeps working: dnd5e 6, say, with the newer modules a world runs that need it,
and the Foundry build those need. If there is no such set, it is not offered, and its red arrow's panel says which world
cannot take it, or which build it needs, and why, step by step, in the words of EMMA's resolver.

Each row that shows the installed version of a package with an update offers its versions in a list, from the newest offered down to the installed one, which is marked so. Each version is in the
colour of EMMA's badge for it, as in the EMMA module's version lists: EMMA's checks judge it, not Foundry's, in each
recorded world that uses the package, with the other packages at the versions chosen. The badge is the worst of those
worlds', and its tooltip names that world when more than one uses the package. A package no recorded world uses is
judged by the Foundry build alone. Opening a list selects its row, and the panel beside the tree explains the version
the keyboard or the pointer is on: its badge and Foundry's explanation, what it needs as its manifest declares it (the
Foundry builds it runs on, the packages it requires, the game systems it runs in, and those it conflicts with), and for
a package more than one recorded world uses, how it fares in each. Once a version is chosen, the panel keeps explaining it, under **<version> update**.
A list offers only the versions that work with what is chosen already, and the panel says what else choosing one would
change. A version that other choices in the plan stand in the way of is listed too, locked: it cannot be chosen, and the
panel says which choices to take out of the plan for it, and why. A version chosen is never changed to suit another. Choosing a version brings in whatever else it needs, from the fewest changes that work: a world's other packages
stay as they are where they can, and Foundry VTT moves only as far as it must. Choosing a version other than the installed one opens the **Update plan** below the tree and the panel, the full width of the window, listing each package that
changes with its installed and new versions, and, for one a choice brings in, which choice needs it. The plan lists
the changes in the order they are to be installed: Foundry VTT first, then the game systems, then the modules, each after
the modules in the plan it requires. Each row gives the manifest URL that installs the version chosen: one for that
version alone, since a package's own manifest URL usually gives its newest. Foundry VTT updates itself, and a version for
which none is found is marked so. **Clear choices**
takes them all back, and choosing the installed version takes back one, with what it brought in. The plan is shown only while something is chosen. Installing the plan
is to come.

The handle between the tree and the panel, and the one above the update plan, resize them, by dragging or from the
keyboard: the arrow keys move a handle, and Home and End to its limits. Each panel keeps its share as the window is
resized, and the browser remembers the sizes.

EMMA finds versions in EMMA's package catalogue first, which holds every release of the packages it knows, with the
Foundry VTT versions each works with. For packages the catalogue does not hold, EMMA reads the manifest each package
declares, Foundry's package listing, and GitHub's and GitLab's lists of releases, through EMMA's version lookup proxy.
A browser cannot read Foundry's listing or the manifests attached to GitHub releases itself, which the proxy lets it
do. Without the proxy, as in a development build, a version found only in a release list says nothing of the Foundry
VTT versions it works with, and is not offered.

### Worlds without a record

EMMA learns which modules a world runs from the record EMMA keeps in the world's folder (see
[The world record](usage.md#the-world-record)). A world that has not been opened with EMMA 0.9 or later active has no
record yet, and is marked **No record**: open it once, with EMMA active, and EMMA records its setup. A world whose
record cannot be read is marked **Record unreadable**; opening it with EMMA active records it again.

## Privacy

The extension reads the setup screen of the servers you allow it on, and the world records in their worlds' folders,
through the server's own pages. It keeps the list of servers you activated, the choice of whether EMMA opens by itself
on each, and the sizes of EMMA's panels, in your browser.

To find updates, EMMA sends the IDs of the installed game systems and modules to EMMA's package catalogue, and asks
GitHub, GitLab, Foundry's package listing and the sites the packages' manifests are on for their releases, through
EMMA's version lookup proxy. Each request to the catalogue or the proxy carries a key that says it comes from EMMA,
and the extension's version. EMMA sends nothing about your worlds, your server or you.

## Limitations of the alpha

- EMMA shows the installation and finds updates for it, but does not install them yet, nor update Foundry VTT
  itself.
- EMMA disables Foundry's package buttons only in a browser where the extension is installed and has opened EMMA. It
  cannot stop installs from other browsers.
- Finding updates needs the EMMA module installed (see [Updates](#updates)).
