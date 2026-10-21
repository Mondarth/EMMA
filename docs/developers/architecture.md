# Architecture

EMMA is split into layers so that as little code as possible touches Foundry VTT directly. Everything below the
adapters is plain TypeScript and Svelte, tested without a Foundry server.

`src/index.ts`
: The entry point. On `init` it registers the settings, the Module details settings menu and the Module Management
  takeover.

`src/module/foundry/`
: The parts that depend on how Foundry behaves rather than on its public API. `settings-entry.ts` takes clicks on the
  Settings sidebar's **Manage Modules** button, because Foundry offers no public way to replace that window. Code here
  is fragile by nature; keep it small and covered by the end-to-end tests.

`src/module/adapters/`
: The only code that reads or changes Foundry's game data. `modules.ts` lists the installed modules and reads and
  writes which are active (the world setting `core.moduleConfiguration`, as Foundry's own window uses). It returns
  plain values, such as `ModuleEntry`, never Foundry documents. It also makes manifest data safe to show: descriptions
  are cleaned with Foundry's `foundry.utils.cleanHTML`, and links other than `http` and `https` are dropped. A
  relative manifest link, such as `"readme": "README.md"`, is taken as a file in the module's folder on the Foundry
  server (resolved with `foundry.utils.getRoute`, so a route prefix is kept).
  The version badge comes from Foundry's `Module#getVersionBadge`, so EMMA judges compatibility exactly as Foundry
  does; only its styles are EMMA's, since Foundry's apply only inside its own package lists.
  `platform.ts` reads the Foundry version and the game system in use, and whether the user is a GM, for hypothetical
  mode. `versions.ts` looks up the versions of the system and the active modules with `@mondarth/fvtt-resolver`: the
  installed manifests (from `toObject()`), GitHub's and GitLab's release lists, declared manifest URLs and, through
  the proxy setting only (the resolver's `proxiedFetch`), Foundry's package listing and, with the system, Foundry's
  core builds from its release notes (`foundryCoreReleases`). Without a proxy it never asks a host that sends no CORS
  headers (GitHub's release downloads, foundryvtt.com), as the browser could not read the answer and would log an
  error. With a proxy, an API key set for it goes with every request in an `X-API-Key` header.
  Modules are looked up one by one as they are needed (`VersionJudge.lookUp`), as GitHub allows 60 requests an hour
  without a token. It offers the installed version and the newer ones, and judges a version with the resolver's
  `check`, in the setup of the core, the system and the other modules staged active at their chosen versions, and turns the verdict into a badge with Foundry's public `Module.getVersionBadge`, so the colours
  and tooltips are Foundry's own. The core and the system may be chosen too (`platformVersions`, `judgePlatform`):
  a version of either is badged by the worst badge the setup it makes would give the system or an active module,
  with a tooltip naming those that do not fit. It returns a `VersionJudge`, keeping resolver types out of the UI.
  `report.ts` reports on a setup for the report window: `planReport` orders the active modules by the depth of the
  tree of active modules depending on each (through `requires`), deepest first, with each version chosen's `versionManifest`
  (a manifest URL for that version alone, which the resolver's source set gathers from every source), never the
  `manifest` a release gives, which usually gives the newest; `checkReport` reports every active module, wording what the resolver's `check` finds, rules broken through
  the resolver's `describeReason`, missed preferences and advisories in EMMA's own words, which the resolver does not
  word; `solveReport` finds the best versions of the active modules: it runs `resolveInRounds` with the
  active modules required, the core and system chosen pinned and nothing preferred, so each module goes to its newest
  version that fits, under a policy that ignores `verified` (a compatibility risk is acceptable), requires the systems
  a release declares, and rejects releases that declare no compatibility. It loads listed manifests through the source
  set, and words a failure with `explain`. The report's `apply` chooses the recommended versions and gives the report
  on the setup they make, which the window then shows.
  `explanation.ts` gives the resolver an `ExplanationMessages` built from `en.json`, so its sentences are localized.

`src/module/state/`
: Reactive state built with Svelte 5 runes, in `.svelte.ts` files. `HypotheticalState` holds hypothetical mode's
  lookup status, the versions found and the version chosen for the core, the system and each module. Its `report`
  gives the report window an `apply` that chooses the versions an update recommends (`HypotheticalState.apply`);
  `EmmaApp` closes the report when it closes, as the hypothetical setup goes with it. Entering hypothetical mode
  snapshots what `ModuleState` has staged (`enterHypothetical`); its Reset and leaving it restore that snapshot
  (`resetHypothetical`, `leaveHypothetical`) and clear the versions chosen (`clearChoices`). Save is disabled in it, and
  closing asks only when something was staged before it (`stagedBeforeHypothetical`). `EmmaRoot` calls its `load` in an
  effect while the mode is on, so the modules staged active are looked up as they are staged; the setup it judges is
  read from `ModuleState`, so it is re-judged whenever a module is staged or a version chosen. `ModuleState` holds the saved activation, the
  changes staged on top of it, the selection on each side of the split view, and which modules' details drawers are
  open (shared by both views, so a drawer stays open when its module moves or the view changes). Moving modules only
  stages changes;
  they reach Foundry when saved through the adapter. `drawer-fields.svelte.ts` lists the details a drawer can show
  and holds `drawerFields`, the details the user has chosen. Its one instance is set from the per-user setting when
  EMMA opens and by the setting's `onChange`, so open drawers follow a change made in the settings menu or on another
  of the user's devices.
  `grouping.ts` holds the pure rules for related modules: `relatedModules` lists the installed modules a module
  requires and recommends, `groupRows` builds the grouped rows (each module grouped under every parent that relates
  to it, following chains and cutting loops), and `conflictedModules` finds the inactive modules in conflict with an
  active one. `ModuleState` applies them: its `rows` group under the active modules, and `setActive` activates the
  modules a module needs, remembering them as implied so that deactivating it deactivates only those it activated. A module an active module
  requires is locked (`lockedBy`, `isLocked`): it cannot be deactivated or selected on the active side, except by
  modules it needs itself, so that modules requiring each other never lock one another.
  In the split view, a side's selection is the modules the user chose plus what they require there (`withRequired`),
  `rowsOf` groups each side under its selected modules (on the active side including recommended modules still
  inactive, for the user to confirm), and moving modules follows the same activation rules as checking them.

`src/module/app/`
: The `ApplicationV2` windows. `EmmaApp` is EMMA itself; `DrawerFieldsConfig` is the Module details settings menu,
  registered with `game.settings.registerMenu` and open to every user, in which they choose the details drawers show;
  `SetupReportApp` (in `setup-report.ts`) is the hypothetical-mode report, opened from the toolbar, one at a time,
  showing the plan, check or resolve picked, as `src/module/lib/report-text.ts` also writes them for download through
  Foundry's `saveDataToFile`;
  and `VersionProxyConfig` is the Version lookup proxy menu, registered `restricted`, so Foundry shows it only to
  users who may change configuration settings, in which a GM sets the proxy (a world setting) and its API key. The key
  is a client setting, kept in the browser's local storage, because Foundry sends every world and user setting to
  every user who joins. Each mounts its Svelte component on first render and unmounts it on close. All but the report ask
  before closing with unsaved changes (staged activation in `EmmaApp`, a changed draft in the menus), through
  `confirmDiscard` in `confirm-discard.ts`; `close({ discard: true })` closes without asking.

`src/component/`
: The Svelte components. They read and change a `ModuleState` and never use `game` directly; text comes through
  `localize` in `src/module/lib/i18n.ts`. The split view's lists are ARIA treegrids rather than listboxes, because an
  open drawer holds links, which a listbox option cannot contain: each module is a selectable level-1 row, and its
  drawer a level-2 row below it. The treegrid keeps focus and points at the keyboard's row with
  `aria-activedescendant`, so its triangles are left out of the Tab order and its key handling ignores keys pressed
  on a drawer's links.

## Activation changes

Which modules are active only changes when the world reloads, so EMMA stages changes rather than applying each one:

1. The adapter reads the installed modules and the saved activation into a `ModuleState`.
2. The views move modules between the inactive and active sides, which only changes the staged activation.
3. Saving writes the staged activation through the adapter, which only a GM with permission to modify settings may do,
   and asks for a reload. `ModuleState.markSaved` then makes it the new baseline.
