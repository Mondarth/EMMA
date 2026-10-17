<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import type { ModuleState } from '@module/state/module-state.svelte';

  interface Props {
    /** The modules to show and stage changes in. */
    modules: ModuleState;
    /** Whether the user may change which modules are active. */
    canManage: boolean;
  }

  const { modules, canManage }: Props = $props();
</script>

{#if modules.entries.length === 0}
  <p class="emma-empty">{localize('MONDARTH-EMMA.List.Empty')}</p>
{:else}
  <ul class="emma-list" aria-label={localize('MONDARTH-EMMA.List.Label')}>
    {#each modules.entries as entry (entry.id)}
      <li class={['emma-module', { changed: entry.id in modules.changes }]}>
        <label>
          <input
            type="checkbox"
            checked={modules.isActive(entry.id)}
            disabled={!canManage}
            onchange={event => {
              modules.setActive(entry.id, event.currentTarget.checked);
            }} />
          <span class="emma-module-title">{entry.title}</span>
        </label>
        <span class="emma-module-version">{entry.version}</span>
        {#if entry.authors.length > 0}
          <span class="emma-module-authors">{entry.authors.join(', ')}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .emma-list {
    flex: 1;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .emma-module {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .emma-module.changed {
    border-left: 3px solid var(--color-border-highlight);
  }

  .emma-module label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .emma-module-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-emphatic);
  }

  .emma-module-version {
    font-size: var(--font-size-12);
    color: var(--color-text-secondary);
  }

  .emma-module-authors {
    grid-column: 1 / -1;
    padding-left: 1.75rem;
    font-size: var(--font-size-12);
    color: var(--color-text-subtle);
  }

  .emma-empty {
    margin: auto;
    color: var(--color-text-secondary);
  }
</style>
