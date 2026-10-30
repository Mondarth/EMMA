<!--
  The installation tree (see lib/tree.ts). The selection follows the keyboard, as in a file browser, so the panel beside
  it shows the row the keyboard is on. As a module may show in many places, the selection is a row's key.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { localize } from '../lib/i18n';
  import type { Overview } from '../lib/overview';
  import type { TreeRow } from '../lib/tree';
  import { INITIALLY_EXPANDED, moveFor, visibleRows } from '../lib/tree';

  interface Props {
    overview: Overview;
    /** The key of the row selected. */
    selected: string;
    onSelect: (row: TreeRow) => void;
  }

  let { overview, selected, onSelect }: Props = $props();

  const expanded = new SvelteSet<string>(INITIALLY_EXPANDED);
  const rows = $derived(visibleRows(overview, expanded));
  // The keyboard's row: the selected row while it shows, or else the first, so that the tree can always be reached.
  const current = $derived(rows.some(({ key }) => key === selected) ? selected : (rows[0]?.key ?? ''));

  let tree = $state<HTMLElement>();

  /**
   * Move the keyboard, and so the selection, to a row.
   * @param row - The row
   */
  async function focusRow(row: TreeRow): Promise<void> {
    onSelect(row);
    await tick();
    tree?.querySelector<HTMLElement>(`[data-key="${CSS.escape(row.key)}"]`)?.focus();
  }

  /**
   * Expand or collapse a row.
   * @param key - The row's key
   */
  function toggle(key: string): void {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
  }

  /**
   * Handle a key pressed on a row.
   * @param event - The key
   */
  function onKeydown(event: KeyboardEvent): void {
    const move = moveFor(rows, current, expanded, event.key);
    if (move === undefined) return;
    event.preventDefault();
    if (move.kind === 'expand') expanded.add(move.key);
    else if (move.kind === 'collapse') expanded.delete(move.key);
    else {
      const row = rows.find(({ key }) => key === move.key);
      if (row !== undefined) void focusRow(row);
    }
  }

  /**
   * Handle a click on a row: select it, and expand or collapse it if the click was on its triangle.
   * @param event - The click
   * @param row - The row
   */
  function onClick(event: MouseEvent, row: TreeRow): void {
    if (event.target instanceof Element && event.target.closest('.emma-tree-toggle') !== null) toggle(row.key);
    onSelect(row);
  }

  /**
   * The text of a row's status.
   * @param row - The row
   * @returns The text, or `undefined` if it has no status
   */
  function statusText(row: TreeRow): string | undefined {
    if (row.status === undefined) return undefined;
    return localize(row.status.kind === 'world' ? `Status.${row.status.value}` : `Module.${row.status.value}`);
  }
</script>

<ul class="emma-tree" role="tree" aria-label={localize('Tree.Label')} bind:this={tree}>
  {#each rows as row (row.key)}
    {@const status = statusText(row)}
    <li
      role="treeitem"
      class="emma-tree-row"
      data-key={row.key}
      aria-level={row.level}
      aria-selected={row.key === selected}
      aria-expanded={row.expandable ? expanded.has(row.key) : undefined}
      tabindex={row.key === current ? 0 : -1}
      style:--emma-depth={row.level - 1}
      onclick={event => {
        onClick(event, row);
      }}
      onkeydown={onKeydown}>
      {#if row.expandable}
        <i
          class={['emma-tree-toggle', 'fa-solid', expanded.has(row.key) ? 'fa-caret-down' : 'fa-caret-right']}
          aria-hidden="true"></i>
      {:else}
        <span class="emma-tree-toggle"></span>
      {/if}
      <span class="emma-tree-title">{row.title}</span>
      {#if row.version !== undefined}
        <span class="emma-tree-version">{row.version}</span>
      {/if}
      {#if status !== undefined}
        <span class={['emma-status', `emma-status-${row.status?.value ?? ''}`]}>{status}</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .emma-tree {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    overflow: auto;
    border-right: 1px solid var(--color-border, #555);
  }

  .emma-tree-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.4rem 0.2rem calc(0.4rem + var(--emma-depth) * 1rem);
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
  }

  .emma-tree-row[aria-selected='true'] {
    background: var(--color-warm-2, rgba(255, 100, 0, 0.25));
  }

  .emma-tree-row:focus-visible {
    outline: 2px solid var(--color-warm-1, #ff6400);
    outline-offset: -2px;
  }

  .emma-tree-toggle {
    width: 0.8rem;
    flex: none;
    text-align: center;
  }

  .emma-tree-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .emma-tree-version {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    opacity: 0.8;
  }

  .emma-status {
    font-size: 0.8em;
    padding: 0 0.3rem;
    border-radius: 3px;
    border: 1px solid currentColor;
  }

  .emma-status-matches,
  .emma-status-same {
    color: var(--color-level-success, #6c6);
  }

  .emma-status-differs,
  .emma-status-other,
  .emma-status-unrecorded {
    color: var(--color-level-warning, #ec3);
  }

  .emma-status-unreadable,
  .emma-status-missing {
    color: var(--color-level-error, #e55);
  }

  /* On the selected row's background, the status takes the row's own colour, which stays readable. */
  .emma-tree-row[aria-selected='true'] .emma-status {
    color: inherit;
  }
</style>
