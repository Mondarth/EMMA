# The browser extension (alpha)

EMMA runs inside a world, but some of its work belongs outside any world: seeing every world on a Foundry VTT server at
once, and which modules each one runs, before launching any of them. That happens on Foundry's setup screen, which
modules cannot change. So EMMA comes with a browser extension that adds EMMA to the setup screen, on the servers you
choose.

:::{warning}
The extension is an **alpha**, for testing: use it at your own risk, on a test installation. It is not listed in the
Chrome Web Store or on Firefox Add-ons; you install it by hand, as described below. See [EMMA's alpha](alpha.md).
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

**EMMA's button** joins the menu at the top of the screen, beside Foundry's own. It opens EMMA's window, whose title
gives EMMA's version, such as **EMMA - installation (0.1.1)**. While EMMA is an alpha, the window's footer warns of it,
with a link to [EMMA's alpha](alpha.md), and asks once for each new version that you acknowledge it with **I
understand**: until you do, the plan cannot be run.

**Foundry's own installs, updates, uninstalls and locks are disabled**: the **Install** button, **Update All**, and the
update button on each package are greyed out, and say that EMMA manages packages on this screen if chosen. So do
**Uninstall**, **Lock** and **Unlock** in the package menu of a game system or module, before Foundry asks anything.
That keeps packages from changing behind EMMA's back; EMMA's own uninstall and lock are the ways in. Worlds are not
affected: uninstalling, locking, creating and launching them. To let Foundry install and update packages again, select
the root of EMMA's tree and check **Let Foundry install and update packages here**. The browser remembers the choice
for that server.

**While EMMA works on something you did**, the item you did it to is covered by a spinner and a word for what EMMA is
doing, until it is done: a tree row while EMMA plans the version you chose there (**Planning**), a row of the plan
while EMMA plans without it, a package in an **Install** section while EMMA looks it up and plans it, the manifest URL
while EMMA reads it (**Reading**), and the buttons that lock (**Locking**), ignore (**Ignoring**), uninstall, plan the
best versions, resume a saved plan (**Resuming**), **Check live** (**Checking**) and **Refresh** (**Refreshing**). A
button is disabled meanwhile, so that what it does is not asked for twice. A version list opens at once, with a spinner
while EMMA checks which versions work with what is chosen, which can take a second or two for a package with many.

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
- **Game systems**: each installed system, with its version, marked **In use** if a world uses it, and the worlds that use it; then any
  system a world uses that is not installed, marked **Not installed**. Only one version of a system is installed at a
  time. Each world shows how its record compares with what is installed now:
  - **Matches its record**: Foundry, the game system and every module are installed at the versions the world last ran
    with.
  - **Changed since it last ran**: something has been updated or uninstalled since. The world's panel lists what.
  - **No record**, or **Record unreadable**: see below.
- **Under each world**, first its game system, then the modules it runs, each with the version the world last ran with
  and whether that version is **In use**, as it is installed, **Another version installed**, or **Not installed**. So a world that last
  ran with an older version of its system, or with a system since uninstalled, says so. A world without a record shows
  nothing under it, as EMMA cannot tell what it last ran with.

Each of these badges says what it reports in its tooltip: **Current state**, or, where the plan changes it, **Planned
update**. A badge of something the plan changes, a package it updates or uninstalls, or a world whose game system, a
module it runs, or Foundry VTT the plan changes, takes its own colour and a dashed border instead of its usual colour.
- **Modules**: every installed module, marked **In use** if a world uses it, grouped by the game systems its manifest
  names. **Universal** holds the modules
  that name none, for use with any system. A module for several systems is in each of their groups.
- **Under each module**, wherever it shows, the modules it requires, and under those the modules they require in turn.
  A requirement that is not installed is marked **Not installed**.

A game system or module the plan installs anew shows in the tree as soon as it is added, at the version the plan
takes, on a pale amber background with an amber edge, marked **Pending**: a game system among the game systems, with
a group of the modules for it, and a module in the groups of the game systems it is for, as Foundry's listing says.

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

Typing in the tree finds: each key selects the first row, from the top, whose title has what is typed so far,
anywhere in it and ignoring case, so "eon" finds Dungeons and Dragons Fifth Edition. The rows it is under open to show
it, and close again when what is typed next is found elsewhere, if they were closed before. What is typed shows above
the tree, or that nothing has it; Backspace takes a letter back, Escape ends it, and so does a pause.

In the panels, each name of a game system, module or world links to it in the tree: clicked, the tree opens to it and
selects it, as it shows in its group rather than under a world. The Install sections' names do not, as there a
title opens its details.

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
with it and those not verified with it. Foundry's builds come from EMMA's package catalogue; without it, Foundry VTT
is not offered an update.

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
panel says which choices to take out of the plan for it, and why. So is a version EMMA found but could not locate a
manifest URL for that version alone, which EMMA needs to install it: it is marked **No manifest for this version**, its
tooltip and the panel say why, and it can never be chosen, nor does a plan ever bring it in. Nor is such a version ever
the update offered; when it is the newest, its red arrow says so. The installed versions need none. A version chosen is never changed to suit another. Choosing a version brings in whatever else it needs, from the fewest changes that work: a world's other packages
stay as they are where they can, and Foundry VTT moves only as far as it must. Choosing a version other than the installed one opens the **Update plan** below the tree and the panel, the full width of the window, listing each package that
changes with its installed and new versions, and, for one a choice brings in, which choice needs it, and, where the
choice does not name it itself, the changes it is needed through: "needed for DAE 14.6.0, through D&D 5e 5.4.0", for a
module whose installed version does not run in the new game system DAE needs. Foundry VTT is among them: a newer build
reads as needed for D&D 5e 6.0.6, through Midi-QOL 14.6.8 and DAE 14.6.6, as each of them needs the build, and DAE
comes in as Midi-QOL requires it; a module whose installed version does not run on the new build reads as needed
through Foundry VTT. Each change that needs it is named, with the changes on the way to it from the choice. The plan lists
the changes in the order they are to be installed: Foundry VTT first, then the game systems, then the modules, each after
the modules in the plan it requires.

Each change chosen has **−** at the right of its row, **Take <title> out of the plan**. A change another needs has
none: it is locked in while that change is in the plan. A click takes out that change alone: what it brought in stays,
chosen at the versions the plan has, so the rest of the plan is as it was; what another change still needs stays
needed by it, locked in. A shift-click takes out what it brought in
too, but for what another change still needs. So does a click on a change in a ring of changes that need each other,
such as a module, a module it requires and the game system they run in, each newer: alone, it would only come back.

**Plan the best versions**, in the root's panel, replaces the plan with the newest versions there are: those of Foundry
VTT, then of each game system, then of each module installed, each the newest the plan can take with those before it,
so that every recorded world keeps working, as choosing each by hand would. Packages locked in Foundry, and Foundry VTT
locked in EMMA, stay as they are. What was chosen before goes, uninstalls and packages added against advice among it.
Each is taken in that order, so another order might find newer versions of some packages at the cost of others. It
covers every package installed, used by a world or not.

Beside it, **Only what worlds use** limits it to the game systems the worlds use, recorded or not, and the modules the
recorded worlds run or will need. The others stay as they are installed, unless what is used needs one changed. They
are not ignored (see [Ignoring](#ignoring)): every other plan still takes them into account, and they can still be
chosen by hand. A world without a record may run modules EMMA cannot see, which the option then leaves as they are. The
browser remembers the choice for that server.

Before the changes, under **Keep first**, the plan offers what Foundry's **Manage Backups** makes by hand:

- a **snapshot of the installation**, unchecked unless the plan changes Foundry VTT, when EMMA checks it as a strong
  recommendation, which can be unchecked;
- a **backup of each world** that uses a package the plan changes: its game system, a module its record says it runs,
  or one it will need when next run. Each is unchecked, as a reminder.

Each has a note, which Foundry keeps with it, written for it at first and free to change. The snapshot's row gives the
space it needs and the space free, as Foundry's own dialog does, and says when there is too little; Foundry does not
say what a world's backup needs, so its row gives the space free alone. What is checked is made before anything changes.

**Run plan** lists the steps and asks to confirm them, then runs them:

1. the snapshot and backups checked, one at a time, as Foundry's **Manage Backups** makes them;
2. the package changes, a package installed anew among them, each installed from the manifest URL of the version
   chosen, as Foundry's Install button installs one; the guard lets EMMA's installs through. Up to five run at once,
   as Foundry's own **Update All** runs them, each as soon as the changes it needs are done: the game systems it runs
   in and the modules it requires, that the plan changes. Foundry's dependency dialog is not shown, as the plan
   already has what each change needs. What you added against EMMA's advice is installed once the rest are over;
3. each package to uninstall, last, one at a time, once the changes of the packages that needed it are done (see
   [Uninstalling](#uninstalling)).

A step that fails stops only the steps that need it, and those that need them in turn: they are **Not run**, each
saying which step it needed. Every other step goes on. Every change needs the snapshot and backups, so if one of
those fails, nothing changes.

Each row says how far its step has got, and the footer how the run went, until the plan is changed again, as by
starting a new one. A package being installed or updated says how far, as Foundry tells it: **Downloading 42%**, then
**Installing 70%**, with a thin bar along the foot of its name, blue as it downloads and then green over it as it
installs. A step done is underlined in green, with a tick and **Done**; a step that failed in red, as far as it got.
Foundry says nothing of how far a snapshot, a backup or an uninstall has got, so those show a spinner until done. The plan's title and its **Run the plan** and **Clear choices** buttons stay in view as its tables
scroll. The footer names the first step that failed, and why, and counts any others that failed or were not run. A
run stops before Foundry VTT's own update: updating Foundry in place restarts it, and is for the user to do with
care. Meanwhile the choices cannot change. After a run, EMMA reads the installation again, so what was done leaves the
plan and the rest stays in it, to run again.

EMMA keeps a copy of the plan in the browser as it runs: as the run starts, and again after each step, with what is
done taken out. It forgets the copy once every step is done. A run that stops before Foundry VTT's own update keeps the
rest of the plan with the build it stopped before: once the setup screen opens on that build, or a later one, however
Foundry was updated (by its own updater, or by a new container image, for example), EMMA restores the plan, and the
footer says so. A run cut short otherwise, by a step failing, or by the page closing while it ran, leaves its copy too:
the next time EMMA opens, the footer offers to **Resume the plan** or **Discard it**. Either way the choices come back
together, as one plan, and the footer names any that cannot, as their versions are no longer offered.

A run that reaches Foundry VTT's own update stops there, and the plan shows the step with a warning: updating Foundry
VTT in place is not recommended, as it replaces what every world runs on and cannot be undone from the setup screen.
It points to Foundry's guide, [Updating Foundry VTT](https://foundryvtt.com/article/updating/), which shows how to
test an update on a separate copy first. Updating in place is offered only where Foundry's own updater can do it:

- not when the server was started with in-place updates switched off (`--noupdate`), as container images and some
  hosts start it: such a Foundry VTT is updated the way it was installed. EMMA cannot tell from the browser how that
  was, so it does not say;
- not when the updater would install another build than the plan's: it installs only the newest build on Foundry's
  update channel, which EMMA asks it for, so the plan says to choose that build, or to install the plan's by other
  means;
- not for a build Foundry installs only by hand, as a new generation.

The plan says so before a run too: once it has Foundry VTT's update, EMMA asks Foundry's updater which build it would
install, and where it cannot update in place, an amber warning triangle at the left of Foundry VTT's title gives the
reason in its tooltip.

When the plan has a build of Foundry VTT older than the newest of its generation, the build is marked in amber and the
row names the newest. If the plan can take the newest as it stands, **Choose <version>** puts it in the plan; if it can
only without some of the other choices, the row names them; otherwise it says the plan cannot take it. A build of a
newer generation is not suggested, as Foundry installs those only by hand.

Where it is offered, the user must type a code of six letters and digits that EMMA shows, to enable **Update Foundry
VTT to <version> in place**. EMMA then starts Foundry's updater, as its **Update Software** form does: Foundry
downloads the build, installs it, and stops or restarts the server. Once the setup screen opens on that build, EMMA
restores the rest of the plan, which the run kept as it stopped, and the footer says so: running the plan then
finishes it. If Foundry does not update, EMMA says why, and keeps the rest of the plan for when Foundry is updated by
other means. Each row gives the manifest URL that installs the version chosen: one for that
version alone, since a package's own manifest URL usually gives its newest. Foundry VTT updates itself, and a version for
which none is found is marked so. **Clear choices**
takes them all back, and choosing the installed version takes back one, with what it brought in. The plan is shown only while something is chosen.

The handle between the tree and the panel, and the one above the update plan, resize them, by dragging or from the
keyboard: the arrow keys move a handle, and Home and End to its limits. Each panel keeps its share as the window is
resized, and the browser remembers the sizes. The window opens where it was last left, at the size it was left; the
update plan, which shows only while it has changes, opens at the height it last had. Foundry keeps the window on the
screen, so one left off a larger screen opens on it.

EMMA finds versions in EMMA's package catalogue alone, in one request: it holds every release of Foundry's listed
packages and of those it is asked for, with the Foundry VTT versions each works with, and checks each package's own
manifest about every hour, so it knows a version published by the manifest alone. A package it does not hold yet,
such as one installed from a manifest only, it fetches by the manifest URL EMMA sends, to give it next time. When the
catalogue cannot be reached, or in a development build without one, EMMA knows only what is installed, offers no
updates, and its footer says **Catalogue unreachable**; **Refresh** tries again.

The footer says how fresh the catalogue's versions are: as of when the installed packages' own manifests were last
checked, the oldest of them. A version published since by a manifest alone is not known yet. **Check live** has the
catalogue read each installed package's own manifest now, then looks again: a check takes a few seconds per package,
and the catalogue checks a package at most once every five minutes, however often it is asked. A package the
catalogue does not hold yet, it fetches, and the footer says how many it is fetching; EMMA looks again once, by
itself, when the catalogue says they may be found.

### Installing

The panels of the **Game systems** and **Modules** groups have an **Install** section below them, of the packages on
Foundry's own package listing, as EMMA's package catalogue keeps it, at the version Foundry offers for the installed
build. Which premium packages you own only Foundry knows: EMMA asks it as its Install dialog does, and remembers the
answer in your browser for a week, so a package bought since shows as not owned until then. It offers those that fit the installation and the plan: not installed, not a premium package the user does not
own, whose newest version runs on the plan's Foundry VTT build, and, for a module, for a game system that stays
installed, or for any. A game system's group of modules offers those for it, and the universal group those for any
system. A search finds a package by its title, ID or author. The list shows enough packages to fill the panel, and
more as it is scrolled down.

Two filters narrow it, each kept for the session, apart for game systems and for modules:

- **Hide … more than one generation behind the plan's build**, on at first, hides what was made for an older
  generation of Foundry VTT: one verified on, or, if it says none, requiring at least, a generation more than one
  behind, such as 12 or 0.6.6 on a 14 build. Many old packages declare no maximum, so would seem to run on every build
  since.
- **Show premium … I do not own**, off at first, shows premium packages that Foundry cannot install for you. They
  cannot be added.
- For modules, a badge for each tag on Foundry's listing, and **Untagged** for those it gives none, all on at first. A
  module shows if any of its tags is on. A click turns a tag on or off; a shift-click turns every other tag off first,
  so on a tag that is off it shows that tag alone, and on one that is on it turns every tag off.

Each package's title opens and closes a drawer, as the triangle at the right of it shows, of what Foundry's listing
says of it: its description, as plain text, authors, newest version, the Foundry VTT builds it declares, the game
systems a module is for, its tags, whether it is premium or exclusive content, and its web page.

The checkbox at the left of each title, **Install <title>**, is ticked while the plan installs it. Ticking it looks up
the package's releases, from the same sources as the updates, and the plan takes the newest version that fits with its
other choices, and with what that version requires, which comes in with it. Its row says it is not installed. If no
version fits, the section says why, in the resolver's words, and the box stays unticked. Unticking it takes it out of
the plan again, with what it brought in. A premium package you do not own has its box disabled.

**Manifest URL**, at the top of the section, installs a package from a manifest you give, as Foundry's own Install
dialog can. **+** (or Enter) has EMMA's package catalogue read it, and checks that it is a
manifest of the section's type: by its file name, `module.json` or `system.json`, or failing that by the fields only a
game system declares. A package installed already, or in the plan already, is refused. EMMA then looks up the modules
it requires, and checks the version it gives against the plan, as for any other: if the plan can take it, it is added,
at the manifest's URL as its own.

If the plan cannot take it, the section says why, with **Override and add anyway**, in red. That adds it to the plan
against EMMA's advice: it is installed as the manifest gives it, and left out of everything the plan resolves, so it
stops nothing else being planned, nor is anything planned around it. Its row in the plan is red, and says **Added
against EMMA's advice**, and the section says it is in the plan, with a button to take it out again. A package added
this way is kept through a new search, until it is installed, but not through a reload for Foundry VTT's own update.

Foundry's listing gives each package's newest version alone, without the modules it requires, and looking up every
listed package's releases would take thousands of requests. So the section filters by what the listing says, and a
package whose newest version does not fit is not offered, even if an older version would.

Each installed package's own manifest is read as updates are searched for, as Foundry's updater reads it: the version
it gives now is offered, though Foundry's listing and EMMA's catalogue may not have it yet, as when an author publishes
by the manifest alone. Some packages publish only such a "latest" manifest, such as
`releases/latest/download/module.json` or a file on a branch, that always gives the newest version, and no manifest for
any one version. EMMA installs and updates them from that manifest, at the version it gives now. A version the
catalogue saw it give before is installed from it only where Foundry's listing lists the package at that version. Older
versions found from it cannot be installed, as the manifest no longer gives them, so such a package has only the
version installed and the latest to choose between. What its download gives may also change under the same version.

### Recommended modules

A module's manifest may name modules it recommends: modules that work with it, though it runs without them. Each shows
in the module's panel, under **Recommends**, and under the module in the tree, marked **Recommended**, with a checkbox
at its left, **Install <recommended> with <module>**. A module ticked comes into the plan with the module that
recommends it, at the newest version that fits, when that module is added to the plan, or at once if it is in the plan
already; one installed already is left as it is. Its row in the plan says **recommended by <module>**. It goes with
that module, taken out of the plan, and so it does unticked. The tree's checkbox takes a click; from the keyboard, the
panel's does the same. Both lists are by name. A module installed already is shown ticked, and cannot be unticked,
as it is there whatever is chosen. One ticked that cannot come into the plan with its module, as no version of it fits,
is unticked again, saying why below it, or, in the tree, in its checkbox's tooltip.

A module to install, in an **Install** section, has the same in its drawer: opened, the drawer reads the module's
manifest, as Foundry's listing does not say, and lists what it **Requires**, which comes into the plan with it, and what
it **Recommends**, each with its checkbox. **Always install recommendations**, with the section's filters, ticks every
recommendation at first, so that a module added brings them all in; untick one in the drawer before adding the module
to leave it out. A module whose wanted recommendation cannot be added is not added either: the section says which, so
that it can be unticked.

### Locking

A game system or module locked in Foundry has a lock beside it in the tree. EMMA keeps it as it is installed, as
Foundry refuses to update or uninstall it: none of its other versions is offered, an update of another package that
needs it changed is not either, and it cannot be uninstalled.

The panel of each installed game system and module has a **Lock** section: **Lock <title> at <version>**, or **Unlock
<title>**, which locks or unlocks it in Foundry at once, as Foundry's own package menu does, and reads the installation
again. A choice of the package in the plan goes once it is locked.

Foundry VTT itself can be locked too, in EMMA alone, as Foundry has no lock for itself: the root's panel has the same
**Lock** section, **Lock Foundry VTT at <build>**. Locked, the plan never updates Foundry VTT, nor offers a newer
build, but still updates the game systems and modules that run on the build installed, so that a server can be kept on
its build and still have its packages brought up to date. The tree's root shows the lock, **Locked in EMMA**. The
browser remembers the lock for that server. It does not stop Foundry's own **Update Software**.

### Ignoring

A world, game system or module can be ignored, in EMMA alone: no plan takes it into account. This is the EMMA module's
hypothetical-mode ignore (see [Modules hypothetical mode ignores](usage.md#modules-hypothetical-mode-ignores)), extended
to whole worlds and to game systems, outside any one world.

- **An ignored game system or module** stays at its installed version. EMMA never looks up or judges its other
  releases, so it is never updated or offered as an update. What it asks of the setup holds nothing back, and whatever
  version of it another package asks for is taken to be the one installed. Use it for a package whose releases EMMA
  cannot read or judge correctly.
- **An ignored world** holds nothing back: what it runs is not taken into account, so a plan may leave it unable to
  run. Use it for a world no longer played.

Each world's panel, and each installed game system's and module's, has an **Ignore** section: **Ignore <title>** or
**Stop ignoring <title>**. It takes effect at once, reading the installation again, not in the plan. An ignored row is
greyed out and struck through in the tree, and can still be selected: its panel has an **Ignored** block in its top
right corner, which stays in view as the panel scrolls. The browser remembers what is ignored for that server.

### Uninstalling

The panel of a game system or module has an **Uninstall** section below it. **Uninstall <title>** puts the package in
the plan: its row says **Uninstall**, with nothing to install, and the tree shows **Uninstall** in place of its version.
**Keep <title> installed** takes it out again. Uninstalling deletes the package from the server, with any data it keeps
there, and cannot be undone; a snapshot keeps a copy.

EMMA refuses an uninstall that would break something it knows of, saying what:

- a game system a world uses;
- a module a recorded world runs, or will need when next run;
- a module another installed module requires, unless the plan uninstalls that one too;
- a package locked in Foundry;
- a package the plan's other choices need, such as a module a newer version chosen requires.

So does the plan: a choice made later that would need a package it uninstalls cannot be made, and keeping a module
another uninstall depends on is refused while that uninstall stands. What EMMA cannot know, it warns of without
refusing: a world without a record may run the module, and modules for a game system uninstalled may be left with no
system they run in.

A run uninstalls as Foundry's own **Uninstall** does once confirmed: the server deletes the package, and the setup
screen forgets it and reads the installation again. An uninstall stays in the plan while the package is still
installed, as when its step failed.

### Worlds without a record

EMMA learns which modules a world runs from the record EMMA keeps in the world's folder (see
[The world record](usage.md#the-world-record)). A world that has not been opened with EMMA 0.9 or later active has no
record yet, and is marked **No record**: open it once, with EMMA active, and EMMA records its setup. A world whose
record cannot be read is marked **Record unreadable**; opening it with EMMA active records it again.

## Privacy

The extension reads the setup screen of the servers you allow it on, and the world records in their worlds' folders,
through the server's own pages. It keeps the list of servers you activated, the choice of whether EMMA opens by itself
on each, and the sizes of EMMA's panels, in your browser.

To find updates, EMMA sends EMMA's package catalogue the IDs and versions of the installed game systems and modules,
the manifest URLs they were installed from, and the installed Foundry VTT generation; a manifest URL you give, to
install from, goes to the catalogue too, which reads it. Each request to the catalogue carries a key that says it
comes from EMMA, and the extension's version. EMMA asks nothing else, and sends nothing about your worlds, your server
or you.

## Limitations of the alpha

- It is tested on few installations: a plan may fail part-way, or do what you did not expect. Back up your worlds
  before running one.
- Each new version must be acknowledged as an alpha before EMMA runs a plan (see [EMMA's alpha](alpha.md)).
- EMMA disables Foundry's package buttons only in a browser where the extension is installed and has opened EMMA. It
  cannot stop installs from other browsers.
- Finding updates needs the EMMA module installed (see [Updates](#updates)).
