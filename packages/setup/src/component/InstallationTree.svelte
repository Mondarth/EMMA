<!--
  The installation tree: the root, the worlds, and the modules each world's record says it runs. TreeSelection follows
  the keyboard, as in a file browser, so the panel beside it shows the row the keyboard is on.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { format, localize } from '../lib/i18n';
  import type { Overview } from '../lib/overview';
  import type { TreeSelection, TreeRow } from '../lib/tree';
  import { keyOf, moveFor, ROOT, visibleRows } from '../lib/tree';

  interface Props {
    overview: Overview;
    selection: TreeSelection;
    onSelect: (selection: TreeSelection) => void;
  }

  let { overview, selection, onSelect }: Props = $props();

  /** The rows expanded: at first the root, so the worlds show. */
  const expanded = new SvelteSet<string>([ROOT]);
  const rows = $derived(visibleRows(overview, expanded));
  const selected = $derived(keyOf(selection));

  let tree = $state<HTMLElement>();

  /**
   * Move the keyboard, and so the selection, to a row.
   * @param row - The row
   */
  async function focusRow(row: TreeRow): Promise<void> {
    onSelect(row.selection);
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
    const move = moveFor(rows, selected, expanded, event.key);
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
    onSelect(row.selection);
  }

  /**
   * The text of a row's status.
   * @param row - The row
   * @returns The text, or `undefined` if it has no status
   */
  function statusText(row: TreeRow): string | undefined {
    if (row.status === undefined) return undefined;
    return localize(row.level === 2 ? `Status.${row.status}` : `Module.${row.status}`);
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
      tabindex={row.key === selected ? 0 : -1}
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
      <span class="emma-tree-title">
        {row.level === 1 ? format('Tree.Root', { version: overview.core }) : row.title}
      </span>
      {#if row.level === 3}
        <span class="emma-tree-version">{row.version}</span>
      {/if}
      {#if status !== undefined}
        <span class={['emma-status', `emma-status-${row.status ?? ''}`]}>{status}</span>
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
