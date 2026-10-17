<script lang="ts">
  import type { View } from '@module/settings';
  import type { ModuleState } from '@module/state/module-state.svelte';

  import Footer from './Footer.svelte';
  import ListView from './ListView.svelte';
  import SplitView from './SplitView.svelte';
  import Toolbar from './Toolbar.svelte';

  interface Props {
    /** The modules shown and the changes staged to them. */
    modules: ModuleState;
    /** The view to show first. */
    initialView: View;
    /** Whether the user may change which modules are active. */
    canManage: boolean;
    /** Saves the staged changes. */
    onSave: () => Promise<unknown>;
    /** Called when the user switches view, so the choice can be remembered. */
    onViewChange?: (view: View) => void;
  }

  const { modules, initialView, canManage, onSave, onViewChange }: Props = $props();

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
      <ListView {modules} {canManage} />
    {:else}
      <SplitView {modules} {canManage} />
    {/if}
  </div>

  <Footer {modules} {canManage} {onSave} />
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
