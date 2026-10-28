<script lang="ts">
  import { format, localize } from '@module/lib/i18n';
  import { lockedTooltip } from '@module/lib/locked';
  import type { DrawerFields } from '@module/state/drawer-fields.svelte';
  import type { ModuleRow } from '@module/state/grouping';
  import type { VersionBadge } from '@module/adapters/modules';
  import type { HypotheticalState } from '@module/state/hypothetical.svelte';
  import type { ModuleState } from '@module/state/module-state.svelte';

  import DisclosureButton from './DisclosureButton.svelte';
  import ModuleDrawer from './ModuleDrawer.svelte';
  import ModuleVersion from './ModuleVersion.svelte';

  interface Props {
    /** The modules to show and stage changes in. */
    modules: ModuleState;
    /** Whether the user may change which modules are active. */
    canManage: boolean;
    /** The details shown in module drawers. */
    fields: DrawerFields;
    /** Whether related modules are grouped under the modules that relate to them, or every module listed flat. */
    grouped?: boolean;
    /** Hypothetical mode's versions while it is on, offering a choice of version for each active module. */
    versions?: HypotheticalState | undefined;
    /** The badges EMMA's checks give the installed modules, when the user chose them; Foundry's own otherwise. */
    badges?: ReadonlyMap<string, VersionBadge | null> | undefined;
  }

  const { modules, canManage, fields, grouped = true, versions, badges }: Props = $props();

  const rows: readonly ModuleRow[] = $derived(
    grouped ? modules.rows : modules.entries.map(entry => ({ key: entry.id, entry, depth: 0, relation: null })),
  );

  // Checked when every module is active, unchecked when none is, and a dash in between.
  const mixed = $derived(!modules.allActive && !modules.noneActive);

  const allLabel = $derived(localize('MONDARTH-EMMA.List.All'));

  const uid = $props.id();

  /**
   * The DOM ID of a row's drawer. A module grouped under several parents has a row, and so a drawer, under each.
   * @param key - The row's key
   * @returns A document-unique ID
   */
  function drawerId(key: string): string {
    return `${uid}-drawer-${key.replaceAll('/', '__')}`;
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

<!-- The counts follow the staged changes, as the split view's do. -->
{#snippet count(side: 'active' | 'inactive', label: string)}
  <span class="emma-list-count">
    {localize(label)}
    {format('MONDARTH-EMMA.Count', { count: String(modules[side].length) })}
  </span>
{/snippet}

<h3 class="emma-list-heading">
  <input
    type="checkbox"
    class="emma-list-all"
    aria-label={allLabel}
    data-tooltip={allLabel}
    checked={modules.allActive}
    disabled={!canManage || modules.entries.length === 0}
    {@attach (node: HTMLInputElement) => {
      node.indeterminate = mixed;
    }}
    onchange={event => {
      modules.setAllActive(event.currentTarget.checked);
    }} />
  <span id={`${uid}-heading`}>{localize('MONDARTH-EMMA.List.Label')}</span>
  {@render count('active', 'MONDARTH-EMMA.Split.Active')}
  {@render count('inactive', 'MONDARTH-EMMA.Split.Inactive')}
</h3>

{#if modules.entries.length === 0}
  <p class="emma-empty">{localize('MONDARTH-EMMA.List.Empty')}</p>
{:else}
  <ul class="emma-list" aria-labelledby={`${uid}-heading`}>
    {#each rows as { key, entry, depth, relation } (key)}
      {@const expanded = modules.isExpanded(entry.id)}
      {@const conflicted = modules.conflicted.has(entry.id)}
      {@const locked = lockedTooltip(modules, entry)}
      {@const ignored = versions?.isIgnored(entry.id) === true}
      <li
        class={[
          'emma-module',
          { changed: entry.id in modules.changes, conflicted, locked: locked !== undefined, ignored },
        ]}
        style:--emma-depth={depth}
        data-module-id={entry.id}>
        <div
          class="emma-module-row"
          data-tooltip={locked ?? (ignored ? localize('MONDARTH-EMMA.Ignore.Tooltip') : undefined)}>
          <label>
            {#if relation !== null}
              {@const label = localize(`MONDARTH-EMMA.Relation.${relation}`)}
              <i class="emma-module-relation fa-solid fa-circle-info" role="img" aria-label={label} data-tooltip={label}
              ></i>
            {/if}
            <input
              type="checkbox"
              checked={modules.isActive(entry.id)}
              disabled={!canManage || locked !== undefined}
              onchange={event => {
                modules.setActive(entry.id, event.currentTarget.checked);
              }}
              onkeydown={event => {
                onKeydown(event, entry.id);
              }} />
            {#if conflicted}
              {@const label = localize('MONDARTH-EMMA.Relation.Conflict')}
              <i
                class="emma-module-conflict fa-solid fa-triangle-exclamation"
                role="img"
                aria-label={label}
                data-tooltip={label}></i>
            {/if}
            <span class="emma-module-title">{entry.title}</span>
          </label>
          <span class="emma-module-version"><ModuleVersion {entry} {versions} {badges} /></span>
          <DisclosureButton
            title={entry.title}
            {expanded}
            controls={drawerId(key)}
            onToggle={() => {
              modules.toggleExpanded(entry.id);
            }}
            onKeydown={(event: KeyboardEvent) => {
              onKeydown(event, entry.id);
            }} />
        </div>
        {#if expanded}
          <ModuleDrawer {entry} id={drawerId(key)} {fields} />
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .emma-list-heading {
    display: flex;
    align-items: center;
    /* Lines the select-all checkbox up with the modules' checkboxes. */
    padding-inline-start: 0.5rem;
    gap: 0.75rem;
    margin: 0 0 0.25rem;
    border: none;
    font-size: var(--font-size-14);
  }

  .emma-list-all {
    flex: none;
    margin: 0;
  }

  .emma-list-count {
    font-weight: normal;
    color: var(--color-text-secondary);
  }

  .emma-list {
    flex: 1;
    margin: 0;
    padding: 0;
    /* Keeps the disclosure triangles clear of a scrollbar drawn over the content. */
    padding-inline-end: 0.75rem;
    overflow-y: auto;
    list-style: none;
  }

  .emma-module {
    padding: 0.25rem 0.25rem 0.25rem calc(0.5rem + var(--emma-depth, 0) * 1.5rem);
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

  /* A module hypothetical mode ignores is greyed out while the mode is on; its row's tooltip says why. */
  .emma-module.ignored .emma-module-row {
    opacity: 0.5;
  }

  /* A module an active module requires cannot be unchecked; its row's tooltip says why. */
  .emma-module.locked label {
    cursor: not-allowed;
  }

  .emma-module.locked input {
    opacity: 0.5;
    /* Disabled controls swallow pointer events in some browsers, which would stop the row's tooltip showing. */
    pointer-events: none;
  }

  .emma-module-relation {
    color: var(--color-text-secondary);
  }

  .emma-module.conflicted .emma-module-title,
  .emma-module-conflict {
    color: var(--color-level-error);
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
