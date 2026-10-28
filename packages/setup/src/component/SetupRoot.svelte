<!--
  EMMA on the setup screen: the installation tree, and beside it the panel for what is selected in it.
-->
<script lang="ts">
  import type { SetupState } from '../app/setup-state.svelte';
  import { localize } from '../lib/i18n';
  import type { TreeSelection } from '../lib/tree';
  import InstallationTree from './InstallationTree.svelte';
  import ModulePanel from './ModulePanel.svelte';
  import RootPanel from './RootPanel.svelte';
  import WorldPanel from './WorldPanel.svelte';

  interface Props {
    setup: SetupState;
  }

  let { setup }: Props = $props();

  let selection = $state<TreeSelection>({ kind: 'root' });

  const overview = $derived(setup.overview);
  // What is selected, if it is still there: after reading again, a world may have gone.
  const worldId = $derived(selection.kind === 'root' ? undefined : selection.world);
  const moduleId = $derived(selection.kind === 'module' ? selection.module : undefined);
  const world = $derived(overview?.worlds.find(({ world: { id } }) => id === worldId));
  const chosen = $derived(world?.modules.find(({ id }) => id === moduleId));
  const runBy = $derived(
    chosen === undefined
      ? []
      : (overview?.worlds ?? [])
          .filter(({ modules }) => modules.some(({ id }) => id === chosen.id))
          .map(({ world: { title } }) => title),
  );
</script>

<div class="emma-setup">
  {#if overview === null}
    <p class="emma-setup-message" role="status">
      {setup.failed ? localize('App.LoadFailed') : localize('App.Loading')}
    </p>
  {:else}
    <InstallationTree
      {overview}
      {selection}
      onSelect={(next: TreeSelection) => {
        selection = next;
      }} />
    <section class="emma-setup-panel">
      {#if world !== undefined && chosen !== undefined}
        <ModulePanel {world} entry={chosen} {runBy} />
      {:else if world !== undefined}
        <WorldPanel {world} />
      {:else}
        <RootPanel
          {overview}
          guardOn={setup.guardOn}
          onGuardChange={(on: boolean) => {
            setup.setGuardOn(on);
          }} />
      {/if}
    </section>
  {/if}
  <footer class="emma-setup-footer">
    <button
      type="button"
      disabled={setup.loading}
      onclick={() => {
        void setup.refresh();
      }}>
      <i class="fa-solid fa-rotate" aria-hidden="true"></i>
      {localize('App.Refresh')}
    </button>
  </footer>
</div>

<style>
  .emma-setup {
    display: grid;
    grid-template-columns: minmax(14rem, 2fr) 3fr;
    grid-template-rows: 1fr auto;
    height: 100%;
    min-height: 0;
    font-family: var(--font-primary, sans-serif);
  }

  .emma-setup-message {
    grid-column: 1 / -1;
    align-self: center;
    text-align: center;
  }

  .emma-setup-panel {
    overflow: auto;
    padding: 0 1rem;
  }

  .emma-setup-footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #555);
  }

  .emma-setup-footer button {
    flex: none;
    width: auto;
  }
</style>
