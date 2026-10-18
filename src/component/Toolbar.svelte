<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import type { View } from '@module/settings';
  import type { ModuleState } from '@module/state/module-state.svelte';

  interface Props {
    /** The view shown. */
    view: View;
    /** The modules, whose drawers the expand button opens and closes. */
    modules: ModuleState;
    /** Whether the list view groups related modules; its toggle is only offered in the list view. */
    grouped?: boolean;
    /** Called when the user picks a view. */
    onViewChange: (view: View) => void;
    /** Called when the user turns the list view's grouping on or off. */
    onGroupedChange?: (grouped: boolean) => void;
  }

  const { view, modules, grouped = true, onViewChange, onGroupedChange }: Props = $props();

  const groupLabel = $derived(localize('MONDARTH-EMMA.Toolbar.Group'));

  // As in Foundry's Module Management: the chevrons point up while the button expands, and down while it collapses.
  const expandLabel = $derived(
    localize(modules.allExpanded ? 'MONDARTH-EMMA.Toolbar.Collapse' : 'MONDARTH-EMMA.Toolbar.Expand'),
  );

  const VIEWS: readonly { view: View; icon: string; label: string }[] = [
    { view: 'list', icon: 'fa-list', label: 'MONDARTH-EMMA.Toolbar.List' },
    { view: 'split', icon: 'fa-table-columns', label: 'MONDARTH-EMMA.Toolbar.Split' },
  ];
</script>

<div class="emma-toolbar" role="toolbar" aria-label={localize('MONDARTH-EMMA.Toolbar.Label')}>
  {#if view === 'list'}
    <button
      type="button"
      class={['emma-toolbar-group', 'icon', 'fa-solid', 'fa-sitemap', { active: grouped }]}
      aria-label={groupLabel}
      aria-pressed={grouped}
      data-tooltip={groupLabel}
      onclick={() => {
        onGroupedChange?.(!grouped);
      }}></button>
  {/if}
  <div class="emma-toolbar-views">
    {#each VIEWS as option (option.view)}
      {@const label = localize(option.label)}
      {@const pressed = view === option.view}
      <button
        type="button"
        class={['icon', 'fa-solid', option.icon, { active: pressed }]}
        aria-label={label}
        aria-pressed={pressed}
        data-tooltip={label}
        onclick={() => {
          onViewChange(option.view);
        }}></button>
    {/each}
  </div>
  <button
    type="button"
    class={['emma-toolbar-expand', 'icon', 'fa-solid', modules.allExpanded ? 'fa-angles-down' : 'fa-angles-up']}
    aria-label={expandLabel}
    data-tooltip={expandLabel}
    disabled={modules.entries.length === 0}
    onclick={() => {
      modules.setAllExpanded(!modules.allExpanded);
    }}></button>
</div>

<style>
  .emma-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .emma-toolbar-views {
    display: flex;
    gap: 0.25rem;
  }

  /* Set apart from the view buttons, since it changes how the list view is arranged rather than choosing a view. */
  .emma-toolbar-group {
    margin-inline-end: 0.5rem;
  }

  /* Set apart from the view buttons, since it acts on the drawers rather than choosing a view. */
  .emma-toolbar-expand {
    margin-inline-start: 1rem;
  }
</style>
