<script lang="ts">
  import type { ModuleState, SelectMode, Side } from '@module/state/module-state.svelte';

  interface Props {
    /** The modules and their selection. */
    modules: ModuleState;
    /** Which side's modules to list. */
    side: Side;
    /** The ID of the element naming the list. */
    labelledby: string;
  }

  const { modules, side, labelledby }: Props = $props();

  const uid = $props.id();

  const entries = $derived(modules[side]);

  /** The option the keyboard is on, shown with a focus ring while the list has focus. */
  let activeId: string | null = $state(null);

  /** The keyboard's option, if it is still on this side. */
  const active = $derived(entries.find(({ id }) => id === activeId)?.id ?? null);

  /**
   * The DOM ID of a module's option.
   * @param id - The module ID
   * @returns A document-unique ID
   */
  function optionId(id: string): string {
    return `${uid}-${side}-${id}`;
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
   * Move through and select modules from the keyboard: the arrow keys, Home and End move and select (extending the
   * selection with Shift, or only moving with Ctrl/Cmd), Space toggles the module the keyboard is on, and Ctrl/Cmd+A
   * selects every module.
   * @param event - The key press
   */
  function onKeydown(event: KeyboardEvent): void {
    if (entries.length === 0) return;
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

<ul
  class="emma-listbox"
  role="listbox"
  tabindex="0"
  aria-multiselectable="true"
  aria-labelledby={labelledby}
  aria-activedescendant={active === null ? undefined : optionId(active)}
  onkeydown={onKeydown}>
  {#each entries as entry (entry.id)}
    <!-- Options are chosen with the keyboard through the listbox, which holds focus. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <li
      id={optionId(entry.id)}
      class={['emma-option', { active: entry.id === active, changed: entry.id in modules.changes }]}
      role="option"
      aria-selected={modules.isSelected(side, entry.id)}
      onclick={event => {
        onClick(event, entry.id);
      }}>
      <span class="emma-option-title">{entry.title}</span>
      <span class="emma-option-version">{entry.version}</span>
    </li>
  {/each}
</ul>

<style>
  .emma-listbox {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
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
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    user-select: none;
    border-left: 3px solid transparent;
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

  .emma-option-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .emma-option-version {
    flex: none;
    font-size: var(--font-size-12);
    opacity: 0.75;
  }
</style>
