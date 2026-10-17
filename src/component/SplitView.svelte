<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import type { ModuleState, Side } from '@module/state/module-state.svelte';

  import SelectableList from './SelectableList.svelte';
  import TransferControls from './TransferControls.svelte';

  interface Props {
    /** The modules to show and stage changes in. */
    modules: ModuleState;
    /** Whether the user may change which modules are active. */
    canManage: boolean;
  }

  const { modules, canManage }: Props = $props();

  const uid = $props.id();

  const TEXT: Readonly<Record<Side, { heading: string; empty: string }>> = {
    inactive: { heading: 'MONDARTH-EMMA.Split.Inactive', empty: 'MONDARTH-EMMA.Split.NoneInactive' },
    active: { heading: 'MONDARTH-EMMA.Split.Active', empty: 'MONDARTH-EMMA.Split.NoneActive' },
  };
</script>

{#snippet pane(side: Side)}
  {@const headingId = `${uid}-${side}-heading`}
  <section class="emma-split-pane">
    <h3 id={headingId}>
      {localize(TEXT[side].heading)}
      <span class="emma-split-count">{modules[side].length}</span>
    </h3>
    <SelectableList {modules} {side} labelledby={headingId} />
    {#if modules[side].length === 0}
      <p class="emma-split-empty">{localize(TEXT[side].empty)}</p>
    {/if}
  </section>
{/snippet}

<div class="emma-split">
  {@render pane('inactive')}
  <TransferControls {modules} {canManage} />
  {@render pane('active')}
</div>

<style>
  .emma-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.5rem;
    flex: 1;
    min-height: 0;
  }

  .emma-split-pane {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 0;
  }

  .emma-split-pane h3 {
    display: flex;
    justify-content: space-between;
    margin: 0;
    border: none;
    font-size: var(--font-size-14);
  }

  .emma-split-count {
    font-weight: normal;
    color: var(--color-text-secondary);
  }

  .emma-split-empty {
    margin: 0;
    font-size: var(--font-size-12);
    color: var(--color-text-secondary);
  }
</style>
