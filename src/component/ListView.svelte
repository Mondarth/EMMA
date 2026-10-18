<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import type { DrawerFields } from '@module/state/drawer-fields.svelte';
  import type { ModuleState } from '@module/state/module-state.svelte';

  import DisclosureButton from './DisclosureButton.svelte';
  import ModuleDrawer from './ModuleDrawer.svelte';
  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    /** The modules to show and stage changes in. */
    modules: ModuleState;
    /** Whether the user may change which modules are active. */
    canManage: boolean;
    /** The details shown in module drawers. */
    fields: DrawerFields;
  }

  const { modules, canManage, fields }: Props = $props();

  const uid = $props.id();

  /**
   * The DOM ID of a module's drawer.
   * @param id - The module ID
   * @returns A document-unique ID
   */
  function drawerId(id: string): string {
    return `${uid}-drawer-${id}`;
  }

  /**
   * Open or close a module's drawer with the right arrow key, from either of the controls on its row.
   * @param event - The key press
   * @param id - The module ID
   */
  function onKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'ArrowRight' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    modules.toggleExpanded(id);
  }
</script>

{#if modules.entries.length === 0}
  <p class="emma-empty">{localize('MONDARTH-EMMA.List.Empty')}</p>
{:else}
  <ul class="emma-list" aria-label={localize('MONDARTH-EMMA.List.Label')}>
    {#each modules.entries as entry (entry.id)}
      {@const expanded = modules.isExpanded(entry.id)}
      <li class={['emma-module', { changed: entry.id in modules.changes }]}>
        <div class="emma-module-row">
          <label>
            <input
              type="checkbox"
              checked={modules.isActive(entry.id)}
              disabled={!canManage}
              onchange={event => {
                modules.setActive(entry.id, event.currentTarget.checked);
              }}
              onkeydown={event => {
                onKeydown(event, entry.id);
              }} />
            <span class="emma-module-title">{entry.title}</span>
          </label>
          <span class="emma-module-version"><VersionBadge version={entry.version} badge={entry.badge} /></span>
          <DisclosureButton
            title={entry.title}
            {expanded}
            controls={drawerId(entry.id)}
            onToggle={() => {
              modules.toggleExpanded(entry.id);
            }}
            onKeydown={(event: KeyboardEvent) => {
              onKeydown(event, entry.id);
            }} />
        </div>
        {#if expanded}
          <ModuleDrawer {entry} id={drawerId(entry.id)} {fields} />
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
    padding: 0.25rem 0.25rem 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .emma-module-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    column-gap: 0.25rem;
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
    display: flex;
    color: var(--color-text-secondary);
  }

  .emma-empty {
    margin: auto;
    color: var(--color-text-secondary);
  }
</style>
