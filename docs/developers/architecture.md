# Architecture

EMMA is split into layers so that as little code as possible touches Foundry VTT directly. Everything below the
adapters is plain TypeScript and Svelte, tested without a Foundry server.

`src/index.ts`
: The entry point. On `init` it registers the settings and the Module Management takeover.

`src/module/foundry/`
: The parts that depend on how Foundry behaves rather than on its public API. `settings-entry.ts` takes clicks on the
  Settings sidebar's **Manage Modules** button, because Foundry offers no public way to replace that window. Code here
  is fragile by nature; keep it small and covered by the end-to-end tests.

`src/module/adapters/`
: The only code that reads or changes Foundry's game data. `modules.ts` lists the installed modules and reads and
  writes which are active (the world setting `core.moduleConfiguration`, as Foundry's own window uses). It returns
  plain values, such as `ModuleEntry`, never Foundry documents.

`src/module/state/`
: Reactive state built with Svelte 5 runes, in `.svelte.ts` files. `ModuleState` holds the saved activation, the
  changes staged on top of it, and the selection on each side of the split view. Moving modules only stages changes;
  they reach Foundry when saved through the adapter.

`src/module/app/`
: `EmmaApp`, the `ApplicationV2` window. It mounts the Svelte root on first render and unmounts it on close.

`src/component/`
: The Svelte components. They read and change a `ModuleState` and never use `game` directly; text comes through
  `localize` in `src/module/lib/i18n.ts`.

## Activation changes

Which modules are active only changes when the world reloads, so EMMA stages changes rather than applying each one:

1. The adapter reads the installed modules and the saved activation into a `ModuleState`.
2. The views move modules between the inactive and active sides, which only changes the staged activation.
3. Saving writes the staged activation through the adapter, which only a GM with permission to modify settings may do,
   and asks for a reload. `ModuleState.markSaved` then makes it the new baseline.
