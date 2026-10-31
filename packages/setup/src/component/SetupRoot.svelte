<!--
  EMMA on the setup screen: the installation tree, and beside it the panel for what is selected in it. In Update mode,
  once versions other than the installed ones are chosen, the update plan opens below both, the full width of the
  window. A handle between the panels resizes them; each keeps its share as the window is resized.
-->
<script lang="ts">
  import type { SetupState } from '../app/setup-state.svelte';
  import type { Layout } from '../foundry/preferences';
  import { readLayout, writeLayout } from '../foundry/preferences';
  import { groupDetail, moduleDetail, systemDetail } from '../lib/details';
  import { format, localize } from '../lib/i18n';
  import type { TreeRow, TreeSelection } from '../lib/tree';
  import { ROOT } from '../lib/tree';
  import GroupPanel from './GroupPanel.svelte';
  import InstallationTree from './InstallationTree.svelte';
  import ModulePanel from './ModulePanel.svelte';
  import RootPanel from './RootPanel.svelte';
  import Splitter from './Splitter.svelte';
  import SystemPanel from './SystemPanel.svelte';
  import UpdatePlan from './UpdatePlan.svelte';
  import WorldPanel from './WorldPanel.svelte';

  interface Props {
    setup: SetupState;
  }

  let { setup }: Props = $props();

  /** The row selected, by its key, and what it shows. */
  let selected = $state<{ key: string; selection: TreeSelection }>({ key: ROOT, selection: { kind: 'root' } });

  const overview = $derived(setup.overview);
  const updates = $derived(setup.updates);
  const planOpen = $derived(updates.on && updates.choices.length > 0);
  const updateCount = $derived(updates.search?.updates.size ?? 0);

  let layout = $state<Layout>(readLayout());

  /**
   * Resize a panel, and keep the sizes for next time.
   * @param change - The panel's new share
   */
  function resize(change: Partial<Layout>): void {
    layout = { ...layout, ...change };
    writeLayout(layout);
  }

  const MODE_HINT = localize('Update.ModeHint');

  /** What the footer says of the search for updates. */
  const updateStatus = $derived.by(() => {
    switch (updates.status) {
      case 'failed':
        return localize('Update.Failed');
      case 'found':
        return updateCount === 0 ? localize('Update.None') : format('Update.Found', { count: updateCount });
      default:
        // The search starts as soon as the installation is read.
        return localize('Update.Searching');
    }
  });
  const unresolved = $derived(updates.search?.unresolved.length ?? 0);
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
    <div class="emma-setup-body">
      <div class="emma-setup-main" style:--emma-tree-share="{layout.tree * 100}%">
        <InstallationTree
          {overview}
          {updates}
          selected={selected.key}
          onSelect={(row: TreeRow) => {
            selected = { key: row.key, selection: row.selection };
          }} />
        <Splitter
          orientation="vertical"
          sizes="before"
          value={layout.tree}
          min={0.15}
          max={0.85}
          label={localize('Layout.Tree')}
          onChange={(tree: number) => {
            resize({ tree });
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
      </div>
      {#if planOpen}
        <Splitter
          orientation="horizontal"
          sizes="after"
          value={layout.plan}
          min={0.15}
          max={0.75}
          label={localize('Layout.Plan')}
          onChange={(plan: number) => {
            resize({ plan });
          }} />
        <div class="emma-setup-plan" style:flex-basis="{layout.plan * 100}%">
          <UpdatePlan {overview} {updates} />
        </div>
      {/if}
    </div>
  {/if}
  <footer class="emma-setup-footer">
    {#if overview !== null}
      <button
        type="button"
        class="emma-setup-mode"
        aria-pressed={updates.on}
        title={MODE_HINT}
        disabled={updateCount === 0}
        onclick={() => {
          updates.setOn(!updates.on);
        }}>
        <i class="fa-solid fa-circle-up" aria-hidden="true"></i>
        {localize('Update.Mode')}
      </button>
      <p class="emma-setup-status" role="status">
        {updateStatus}
        {#if unresolved > 0}
          <span class="emma-setup-note">{format('Update.Unresolved', { count: unresolved })}</span>
        {/if}
      </p>
    {/if}
    <button
      type="button"
      class="emma-setup-refresh"
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
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-family: var(--font-primary, sans-serif);
  }

  .emma-setup-message {
    flex: 1;
    align-content: center;
    text-align: center;
  }

  .emma-setup-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .emma-setup-main {
    display: grid;
    grid-template-columns: var(--emma-tree-share) auto minmax(0, 1fr);
    flex: 1 1 0;
    min-height: 0;
  }

  .emma-setup-main > :global(*) {
    min-height: 0;
  }

  .emma-setup-panel {
    overflow: auto;
    padding: 0 1rem;
  }

  .emma-setup-plan {
    display: flex;
    flex-direction: column;
    flex-grow: 0;
    flex-shrink: 0;
    min-height: 0;
    overflow: auto;
  }

  .emma-setup-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #555);
  }

  .emma-setup-footer button {
    flex: none;
    width: auto;
  }

  .emma-setup-refresh {
    margin-left: auto;
  }

  .emma-setup-mode[aria-pressed='true'] {
    background: var(--color-warm-2, rgba(255, 100, 0, 0.25));
  }

  .emma-setup-status {
    flex: 1;
    margin: 0;
  }

  .emma-setup-note {
    font-size: 0.9em;
    opacity: 0.85;
  }
</style>
