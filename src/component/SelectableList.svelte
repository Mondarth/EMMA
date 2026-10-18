<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import { lockedTooltip } from '@module/lib/locked';
  import type { DrawerFields } from '@module/state/drawer-fields.svelte';
  import type { ModuleRow } from '@module/state/grouping';
  import type { ModuleState, SelectMode, Side } from '@module/state/module-state.svelte';

  import DisclosureButton from './DisclosureButton.svelte';
  import ModuleDrawer from './ModuleDrawer.svelte';
  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    /** The modules and their selection. */
    modules: ModuleState;
    /** Which side's modules to list. */
    side: Side;
    /** The ID of the element naming the list. */
    labelledby: string;
    /** The details shown in module drawers. */
    fields: DrawerFields;
    /** Whether the user may change which modules are active, as confirming a recommended module does. */
    canManage: boolean;
  }

  const { modules, side, labelledby, fields, canManage }: Props = $props();

  const uid = $props.id();

  const rows = $derived(modules.rowsOf(side));

  /** The key of the row the keyboard is on, shown with a focus ring while the list has focus. */
  let activeKey: string | null = $state(null);

  /**
   * The keyboard's row, if it is still on this side. When grouping moves its module, the keyboard follows it to the
   * module's first row.
   */
  const active: ModuleRow | null = $derived.by(() => {
    if (activeKey === null) return null;
    const moduleId = activeKey.split('/').at(-1);
    return rows.find(({ key }) => key === activeKey) ?? rows.find(({ entry }) => entry.id === moduleId) ?? null;
  });

  /**
   * The DOM ID of a row.
   * @param key - The row's key
   * @returns A document-unique ID
   */
  function optionId(key: string): string {
    return `${uid}-${side}-${key.replaceAll('/', '__')}`;
  }

  /**
   * The DOM ID of a row's drawer.
   * @param key - The row's key
   * @returns A document-unique ID
   */
  function drawerId(key: string): string {
    return `${optionId(key)}-drawer`;
  }

  /**
   * How a click or key press with these modifiers changes the selection.
   * @param event - The mouse or keyboard event
   * @returns The selection mode
   */
  function modeOf(event: MouseEvent | KeyboardEvent): SelectMode {
    if (event.shiftKey) return 'range';
    if (event.ctrlKey || event.metaKey) return 'toggle';
    return 'replace';
  }

  /**
   * Put the keyboard on a row and scroll it into view.
   * @param key - The row's key
   */
  function activate(key: string): void {
    activeKey = key;
    document.getElementById(optionId(key))?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Select a clicked row's module.
   * @param event - The click
   * @param row - The row clicked
   */
  function onClick(event: MouseEvent, row: ModuleRow): void {
    modules.select(side, row.entry.id, modeOf(event));
    activeKey = row.key;
  }

  /**
   * Move through and select modules from the keyboard: the up and down arrow keys, Home and End move and select
   * (extending the selection with Shift, or only moving with Ctrl/Cmd), Space toggles the module the keyboard is on,
   * the right arrow key opens or closes its drawer, and Ctrl/Cmd+A selects every module. Keys pressed on a link in an
   * open drawer, or on a checkbox, are left to it.
   * @param event - The key press
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget || rows.length === 0) return;
    const keys = rows.map(({ key }) => key);
    const index = active === null ? -1 : keys.indexOf(active.key);
    const command = event.ctrlKey || event.metaKey;

    let target: number;
    switch (event.key) {
      case 'ArrowDown':
        target = Math.min(index + 1, keys.length - 1);
        break;
      case 'ArrowUp':
        target = index === -1 ? 0 : Math.max(index - 1, 0);
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = keys.length - 1;
        break;
      case 'ArrowRight':
        if (active === null) return;
        event.preventDefault();
        modules.toggleExpanded(active.entry.id);
        return;
      case ' ':
        event.preventDefault();
        if (active === null) activate(keys[0] as string);
        else modules.select(side, active.entry.id, 'toggle');
        return;
      case 'a':
      case 'A':
        if (!command) return;
        event.preventDefault();
        modules.selectAll(side);
        return;
      default:
        return;
    }

    event.preventDefault();
    const next = rows[target] as ModuleRow;
    activate(next.key);
    if (event.shiftKey) modules.select(side, next.entry.id, 'range');
    else if (!command) modules.select(side, next.entry.id, 'replace');
  }
</script>

<!-- A treegrid rather than a listbox, so that an open drawer's links are not hidden inside an option. -->
<div
  class="emma-listbox"
  role="treegrid"
  tabindex="0"
  aria-multiselectable="true"
  aria-labelledby={labelledby}
  aria-activedescendant={active === null ? undefined : optionId(active.key)}
  onkeydown={onKeydown}>
  {#each rows as row (row.key)}
    {@const { key, entry, depth, relation } = row}
    {@const expanded = modules.isExpanded(entry.id)}
    {@const locked = lockedTooltip(modules, entry)}
    {@const conflicted = modules.conflicted.has(entry.id)}
    <!-- On the active side, a recommended module grouped under a selected module may still be inactive: its checkbox
         confirms it, activating it. -->
    {@const confirmable = side === 'active' && relation === 'recommended'}
    <!-- Rows are chosen with the keyboard through the treegrid, which holds focus and points at the keyboard's row with
         aria-activedescendant; a focusable row would take focus from it when clicked. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
    <div
      id={optionId(key)}
      class={[
        'emma-option',
        {
          active: key === active?.key,
          changed: entry.id in modules.changes,
          locked: locked !== undefined,
          conflicted,
        },
      ]}
      style:--emma-depth={depth}
      role="row"
      aria-level={depth + 1}
      aria-expanded={expanded}
      aria-selected={modules.isSelected(side, entry.id)}
      aria-disabled={locked === undefined ? undefined : 'true'}
      data-tooltip={locked}
      aria-labelledby={`${optionId(key)}-title`}
      onclick={event => {
        onClick(event, row);
      }}>
      <div class="emma-option-main" role="gridcell">
        {#if relation !== null}
          {@const label = localize(`MONDARTH-EMMA.Relation.${relation}`)}
          <i class="emma-option-relation fa-solid fa-circle-info" role="img" aria-label={label} data-tooltip={label}
          ></i>
        {/if}
        {#if confirmable}
          {@const label = localize('MONDARTH-EMMA.Split.Confirm')}
          <input
            type="checkbox"
            aria-label={label}
            data-tooltip={label}
            checked={modules.isActive(entry.id)}
            disabled={!canManage}
            onclick={event => {
              event.stopPropagation();
            }}
            onchange={event => {
              modules.setActive(entry.id, event.currentTarget.checked);
            }} />
        {/if}
        {#if conflicted}
          {@const label = localize('MONDARTH-EMMA.Relation.Conflict')}
          <i
            class="emma-option-conflict fa-solid fa-triangle-exclamation"
            role="img"
            aria-label={label}
            data-tooltip={label}></i>
        {/if}
        <span id={`${optionId(key)}-title`} class="emma-option-title">{entry.title}</span>
      </div>
      <div class="emma-option-version" role="gridcell">
        <VersionBadge version={entry.version} badge={entry.badge} />
      </div>
      <div class="emma-option-toggle" role="gridcell">
        <DisclosureButton
          title={entry.title}
          {expanded}
          controls={drawerId(key)}
          focusable={false}
          onToggle={() => {
            modules.toggleExpanded(entry.id);
          }} />
      </div>
    </div>
    {#if expanded}
      <div class="emma-option-details" role="row" aria-level={depth + 2}>
        <div role="gridcell">
          <ModuleDrawer {entry} id={drawerId(key)} {fields} />
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .emma-listbox {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    /* Keeps the disclosure triangles clear of a scrollbar drawn over the content. */
    padding-inline-end: 0.75rem;
    overflow-y: auto;
    list-style: none;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .emma-listbox:focus-visible {
    outline: 1px solid var(--button-focus-outline-color);
  }

  .emma-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.25rem 0.25rem 0.25rem calc(0.5rem + var(--emma-depth, 0) * 1.5rem);
    cursor: pointer;
    user-select: none;
    border-left: 3px solid transparent;
  }

  /* A module an active module requires cannot be selected, so cannot be deactivated; its tooltip says why. */
  .emma-option.locked {
    cursor: not-allowed;
  }

  .emma-option.locked .emma-option-title {
    opacity: 0.6;
  }

  .emma-option.changed {
    border-left-color: var(--color-border-highlight);
  }

  .emma-option[aria-selected='true'] {
    background: var(--color-text-selection-bg);
    color: var(--color-text-selection);
  }

  .emma-listbox:focus-visible .emma-option.active {
    outline: 1px dashed var(--button-focus-outline-color);
    outline-offset: -2px;
  }

  .emma-option-main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .emma-option-main input {
    flex: none;
    margin: 0;
  }

  .emma-option-relation {
    color: var(--color-text-secondary);
  }

  .emma-option.conflicted .emma-option-title,
  .emma-option-conflict {
    color: var(--color-level-error);
  }

  .emma-option-toggle {
    display: flex;
    flex: none;
  }

  .emma-option-details {
    border-left: 3px solid transparent;
    border-bottom: 1px solid var(--color-border);
  }

  .emma-option-title {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .emma-option-version {
    display: flex;
    flex: none;
  }
</style>
