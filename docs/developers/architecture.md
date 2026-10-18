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

`src/module/state/`
: Reactive state built with Svelte 5 runes, in `.svelte.ts` files. `ModuleState` holds the saved activation, the
  changes staged on top of it, the selection on each side of the split view, and which modules' details drawers are
  open (shared by both views, so a drawer stays open when its module moves or the view changes). Moving modules only
  stages changes;
  they reach Foundry when saved through the adapter. `drawer-fields.svelte.ts` lists the details a drawer can show
  and holds `drawerFields`, the details the user has chosen. Its one instance is set from the per-user setting when
  EMMA opens and by the setting's `onChange`, so open drawers follow a change made in the settings menu or on another
  of the user's devices.

`src/module/app/`
: The `ApplicationV2` windows. `EmmaApp` is EMMA itself, and `DrawerFieldsConfig` the Module details settings menu,
  registered with `game.settings.registerMenu` and open to every user, in which they choose the details drawers show.
  Each mounts its Svelte component on first render and unmounts it on close.

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
