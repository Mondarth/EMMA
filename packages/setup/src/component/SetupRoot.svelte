<!--
  EMMA on the setup screen: the installation tree, and beside it the panel for what is selected in it.
-->
<script lang="ts">
  import type { SetupState } from '../app/setup-state.svelte';
  import { groupDetail, moduleDetail, systemDetail } from '../lib/details';
  import { localize } from '../lib/i18n';
  import type { TreeRow, TreeSelection } from '../lib/tree';
  import { ROOT } from '../lib/tree';
  import GroupPanel from './GroupPanel.svelte';
  import InstallationTree from './InstallationTree.svelte';
  import ModulePanel from './ModulePanel.svelte';
  import RootPanel from './RootPanel.svelte';
  import SystemPanel from './SystemPanel.svelte';
  import WorldPanel from './WorldPanel.svelte';

  interface Props {
    setup: SetupState;
  }

  let { setup }: Props = $props();

  /** The row selected, by its key, and what it shows. */
  let selected = $state<{ key: string; selection: TreeSelection }>({ key: ROOT, selection: { kind: 'root' } });

  const overview = $derived(setup.overview);
  const selection = $derived(selected.selection);
  // What is selected, if it is still there: after reading again, a world may have gone.
  const world = $derived(
    selection.kind === 'world' ? overview?.worlds.find(({ world: { id } }) => id === selection.world) : undefined,
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
      selected={selected.key}
      onSelect={(row: TreeRow) => {
        selected = { key: row.key, selection: row.selection };
      }} />
    <section class="emma-setup-panel">
      {#if selection.kind === 'module'}
        <ModulePanel detail={moduleDetail(overview, selection.module, selection.world)} />
      {:else if selection.kind === 'system'}
        <SystemPanel detail={systemDetail(overview, selection.system, selection.world)} />
      {:else if selection.kind === 'systems' || selection.kind === 'modules' || selection.kind === 'group'}
        <GroupPanel detail={groupDetail(overview, selection)} />
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
