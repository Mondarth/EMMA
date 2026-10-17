<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import type { View } from '@module/settings';

  interface Props {
    /** The view shown. */
    view: View;
    /** Called when the user picks a view. */
    onViewChange: (view: View) => void;
  }

  const { view, onViewChange }: Props = $props();

  const VIEWS: readonly { view: View; icon: string; label: string }[] = [
    { view: 'list', icon: 'fa-list', label: 'MONDARTH-EMMA.Toolbar.List' },
    { view: 'split', icon: 'fa-table-columns', label: 'MONDARTH-EMMA.Toolbar.Split' },
  ];
</script>

<div class="emma-toolbar" role="toolbar" aria-label={localize('MONDARTH-EMMA.Toolbar.Label')}>
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
</style>
