<script lang="ts">
  import type { View } from '@module/settings';
  import type { ModuleState } from '@module/state/module-state.svelte';

  import ListView from './ListView.svelte';
  import SplitView from './SplitView.svelte';
  import Toolbar from './Toolbar.svelte';

  interface Props {
    /** The modules shown and the changes staged to them. */
    modules: ModuleState;
    /** The view to show first. */
    initialView: View;
    /** Called when the user switches view, so the choice can be remembered. */
    onViewChange?: (view: View) => void;
  }

  const { modules, initialView, onViewChange }: Props = $props();

  // The window is mounted afresh each time it opens, so the initial view is only read once.
  // svelte-ignore state_referenced_locally
  let view: View = $state(initialView);
</script>

<div class="emma-root">
  <Toolbar
    {view}
    onViewChange={(next: View) => {
      if (next === view) return;
      view = next;
      onViewChange?.(next);
    }} />

  <div class="emma-pane">
    {#if view === 'list'}
      <ListView {modules} />
    {:else}
      <SplitView {modules} />
    {/if}
  </div>
</div>

<style>
  .emma-root {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    font-family: var(--font-body);
  }

  .emma-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
</style>
