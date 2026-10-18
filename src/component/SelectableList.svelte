<script lang="ts">
  import { lockedTooltip } from '@module/lib/locked';
  import type { DrawerFields } from '@module/state/drawer-fields.svelte';
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
  }

  const { modules, side, labelledby, fields }: Props = $props();

  const uid = $props.id();

  const entries = $derived(modules[side]);

  /** The row the keyboard is on, shown with a focus ring while the list has focus. */
  let activeId: string | null = $state(null);

  /** The keyboard's row, if it is still on this side. */
  const active = $derived(entries.find(({ id }) => id === activeId)?.id ?? null);

  /**
   * The DOM ID of a module's row.
   * @param id - The module ID
   * @returns A document-unique ID
   */
  function optionId(id: string): string {
    return `${uid}-${side}-${id}`;
  }

  /**
   * The DOM ID of a module's drawer.
   * @param id - The module ID
   * @returns A document-unique ID
   */
  function drawerId(id: string): string {
    return `${optionId(id)}-drawer`;
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
   * Put the keyboard on a module and scroll it into view.
   * @param id - The module ID
   */
  function activate(id: string): void {
    activeId = id;
    document.getElementById(optionId(id))?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Select a clicked module.
   * @param event - The click
   * @param id - The module clicked
   */
  function onClick(event: MouseEvent, id: string): void {
    modules.select(side, id, modeOf(event));
    activeId = id;
  }

  /**
   * Move through and select modules from the keyboard: the up and down arrow keys, Home and End move and select
   * (extending the selection with Shift, or only moving with Ctrl/Cmd), Space toggles the module the keyboard is on,
   * the right arrow key opens or closes its drawer, and Ctrl/Cmd+A selects every module. Keys pressed on a link in an
   * open drawer are left to the link.
   * @param event - The key press
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget || entries.length === 0) return;
    const ids = entries.map(({ id }) => id);
    const index = active === null ? -1 : ids.indexOf(active);
    const command = event.ctrlKey || event.metaKey;

    let target: number;
    switch (event.key) {
      case 'ArrowDown':
        target = Math.min(index + 1, ids.length - 1);
        break;
      case 'ArrowUp':
        target = index === -1 ? 0 : Math.max(index - 1, 0);
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = ids.length - 1;
        break;
      case 'ArrowRight':
        if (active === null) return;
        event.preventDefault();
        modules.toggleExpanded(active);
        return;
      case ' ':
        event.preventDefault();
        if (active === null) activate(ids[0] as string);
        else modules.select(side, active, 'toggle');
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
    const next = ids[target] as string;
    activate(next);
    if (event.shiftKey) modules.select(side, next, 'range');
    else if (!command) modules.select(side, next, 'replace');
  }
</script>

<!-- A treegrid rather than a listbox, so that an open drawer's links are not hidden inside an option. -->
<div
  class="emma-listbox"
  role="treegrid"
  tabindex="0"
  aria-multiselectable="true"
  aria-labelledby={labelledby}
  aria-activedescendant={active === null ? undefined : optionId(active)}
  onkeydown={onKeydown}>
  {#each entries as entry (entry.id)}
    {@const expanded = modules.isExpanded(entry.id)}
    {@const locked = lockedTooltip(modules, entry)}
    <!-- Rows are chosen with the keyboard through the treegrid, which holds focus and points at the keyboard's row with
         aria-activedescendant; a focusable row would take focus from it when clicked. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
    <div
      id={optionId(entry.id)}
      class={[
        'emma-option',
        { active: entry.id === active, changed: entry.id in modules.changes, locked: locked !== undefined },
      ]}
      role="row"
      aria-level="1"
      aria-expanded={expanded}
      aria-selected={modules.isSelected(side, entry.id)}
      aria-disabled={locked === undefined ? undefined : 'true'}
      data-tooltip={locked}
      aria-labelledby={`${optionId(entry.id)}-title`}
      onclick={event => {
        onClick(event, entry.id);
      }}>
      <div class="emma-option-main" role="gridcell">
        <span id={`${optionId(entry.id)}-title`} class="emma-option-title">{entry.title}</span>
      </div>
      <div class="emma-option-version" role="gridcell">
        <VersionBadge version={entry.version} badge={entry.badge} />
      </div>
      <div class="emma-option-toggle" role="gridcell">
        <DisclosureButton
          title={entry.title}
          {expanded}
          controls={drawerId(entry.id)}
          focusable={false}
          onToggle={() => {
            modules.toggleExpanded(entry.id);
          }} />
      </div>
    </div>
    {#if expanded}
      <div class="emma-option-details" role="row" aria-level="2">
        <div role="gridcell">
          <ModuleDrawer {entry} id={drawerId(entry.id)} {fields} />
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
    padding: 0.25rem 0.25rem 0.25rem 0.5rem;
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
    flex: 1;
    min-width: 0;
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
