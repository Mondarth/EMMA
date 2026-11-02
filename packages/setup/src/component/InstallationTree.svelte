<!--
  The installation tree (see lib/tree.ts). The selection follows the keyboard, as in a file browser, so the panel beside
  it shows the row the keyboard is on. As a module may show in many places, the selection is a row's key.

  A package with an update on offer has a blue arrow to the left of each of its rows, and one with a newer version EMMA
  cannot offer a red one beside it; a collapsed row that hides either has the same arrow, fainter. In Update mode, each row that shows its installed version offers its versions in a list instead, each in
  the colour of EMMA's badge for it, as the EMMA module's version lists are; one the plan uninstalls says so instead.
  A package the plan installs anew shows at the version the plan takes, on a pale amber background, and says it is
  pending, so that the colour is not all that tells.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import type { UpdateState } from '../app/update-state.svelte';
  import { localize } from '../lib/i18n';
  import { UNINSTALL } from '../lib/plans';
  import type { Overview } from '../lib/overview';
  import type { PendingPackage, TreeRow } from '../lib/tree';
  import { INITIALLY_EXPANDED, moveFor, packageOf, visibleRows } from '../lib/tree';

  import VersionPicker from './VersionPicker.svelte';

  interface Props {
    overview: Overview;
    /** The key of the row selected. */
    selected: string;
    onSelect: (row: TreeRow) => void;
    /** The updates on offer, and the versions chosen; none until they are searched for. */
    updates?: UpdateState | undefined;
    /** The packages the plan installs anew. */
    pending?: readonly PendingPackage[];
  }

  let { overview, selected, onSelect, updates, pending = [] }: Props = $props();

  // A column for the red arrows only once there are any, so that the tree is no wider without.
  const anyBlocked = $derived((updates?.search?.blocked.size ?? 0) > 0);

  /**
   * Whether any of some packages has an update on offer, or a newer version blocked.
   * @param keys - The packages
   * @param has - Whether a package has it
   * @returns `true` if any has
   */
  function anyOf(keys: ReadonlySet<string> | undefined, has: (key: string) => boolean): boolean {
    return [...(keys ?? [])].some(has);
  }

  const expanded = new SvelteSet<string>(INITIALLY_EXPANDED);
  const rows = $derived(visibleRows(overview, expanded, pending));
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
   * Whether the plan changes what a row's status reports: the package, or for a world, Foundry VTT, its game system or
   * a module it runs.
   * @param row - The row
   * @returns `true` if it does
   */
  function planned(row: TreeRow): boolean {
    const changed = updates?.choices.map(({ key }) => key) ?? [];
    const { selection } = row;
    if (selection.kind !== 'world') {
      const key = packageOf(selection);
      return key !== undefined && changed.includes(key);
    }
    const world = overview.worlds.find(({ world: { id } }) => id === selection.world);
    const uses = [
      'core',
      ...(world === undefined
        ? []
        : [`system:${world.world.system}`, ...world.modules.map(({ id }) => `module:${id}`)]),
    ];
    return uses.some(key => changed.includes(key));
  }

  /**
   * The text of a row's status.
   * @param row - The row
   * @returns The text, or `undefined` if it has no status
   */
  function statusText(row: TreeRow): string | undefined {
    if (row.status === undefined) return undefined;
    if (row.status.kind === 'world') return localize(`Status.${row.status.value}`);
    // The tree says a version installed is in use, as a world uses it; the panels say so of what is installed.
    return localize(row.status.value === 'same' ? 'Tree.InUse' : `Module.${row.status.value}`);
  }
</script>

{#snippet arrow(text: string, faint: boolean)}
  <i class={['fa-solid', 'fa-circle-up', { 'emma-tree-hidden': faint }]} title={localize(text)} aria-hidden="true"></i>
  <span class="emma-visually-hidden">{localize(text)}</span>
{/snippet}

<ul class="emma-tree" role="tree" aria-label={localize('Tree.Label')} bind:this={tree}>
  {#each rows as row (row.key)}
    {@const status = statusText(row)}
    {@const key = packageOf(row.selection)}
    {@const update = key === undefined ? undefined : updates?.updateOf(key)}
    {@const blocked = key !== undefined && updates?.blockedOf(key) !== undefined}
    {@const removing = key !== undefined && row.installed === true && updates?.chosenOf(key) === UNINSTALL}
    {@const hidden = updates !== undefined && anyOf(row.hides, under => updates.updateOf(under) !== undefined)}
    {@const hiddenBlocked = updates !== undefined && anyOf(row.hides, under => updates.blockedOf(under) !== undefined)}
    <li
      role="treeitem"
      class={['emma-tree-row', { 'emma-tree-pending': row.pending }]}
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
      <span class="emma-tree-update">
        {#if update !== undefined}
          {@render arrow('Update.Available', false)}
        {:else if hidden}
          {@render arrow('Update.Hidden', true)}
        {/if}
      </span>
      {#if anyBlocked}
        <span class="emma-tree-update emma-tree-blocked">
          {#if blocked}
            {@render arrow('Update.Blocked', false)}
          {:else if hiddenBlocked}
            {@render arrow('Update.HiddenBlocked', true)}
          {/if}
        </span>
      {/if}
      {#if row.expandable}
        <i
          class={['emma-tree-toggle', 'fa-solid', expanded.has(row.key) ? 'fa-caret-down' : 'fa-caret-right']}
          aria-hidden="true"></i>
      {:else}
        <span class="emma-tree-toggle"></span>
      {/if}
      <span class="emma-tree-title">{row.title}</span>
      {#if row.locked}
        {@const lockedBy = localize(row.selection.kind === 'root' ? 'Lock.TreeCore' : 'Lock.Tree')}
        <i class="fa-solid fa-lock emma-tree-locked" role="img" aria-label={lockedBy} data-tooltip={lockedBy}></i>
      {/if}
      {#if removing}
        <span class="emma-tree-uninstall">{localize('Update.Uninstall')}</span>
      {:else if updates !== undefined && update !== undefined && key !== undefined && row.installed === true}
        <VersionPicker
          title={row.title}
          chosen={updates.optionOf(key, updates.chosenOf(key) ?? update.installed)}
          versions={() => updates.optionsFor(key)}
          installed={update.installed}
          onChoose={(version: string) => {
            void updates.choose(key, version);
          }}
          onOpen={() => {
            // The panel beside the tree explains the versions looked at.
            onSelect(row);
          }}
          onPreview={(version: string | null) => {
            updates.setPreview(key, version);
          }} />
      {:else if row.version !== undefined}
        <span class="emma-tree-version">{row.version}</span>
      {/if}
      {#if status !== undefined}
        {@const affected = planned(row)}
        {@const meaning = localize(affected ? 'Status.Planned' : 'Status.Current')}
        <span
          class={['emma-status', affected ? 'emma-status-planned' : `emma-status-${row.status?.value ?? ''}`]}
          data-tooltip={meaning}>
          {status}<span class="emma-visually-hidden">, {meaning}</span>
        </span>
      {/if}
      {#if row.pending}
        <span class="emma-status emma-tree-pending-label">{localize('Tree.Pending')}</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  /*
   * A package the plan installs anew: dark brown on pale amber, 12.2:1, past WCAG AAA's 7:1 whatever the theme, with a
   * darker amber edge, 4.1:1 against the pale amber and 3.7:1 against a dark theme, past the 3:1 a mark needs. A
   * selected row takes the selection's colours, with the edge, so that it still shows as pending.
   */
  .emma-tree-pending {
    --emma-pending-background: #fff3cd;
    --emma-pending-text: #3d2c00;
    --emma-pending-edge: #a06c00;
    background: var(--emma-pending-background);
    color: var(--emma-pending-text);
    box-shadow: inset 3px 0 0 var(--emma-pending-edge);
  }

  .emma-tree-pending[aria-selected='true'] {
    color: inherit;
  }

  .emma-tree-pending .emma-tree-version,
  .emma-tree-pending .emma-status {
    color: inherit;
  }

  .emma-tree-locked {
    font-size: 0.8em;
    opacity: 0.8;
  }

  .emma-tree-pending-label {
    font-style: italic;
  }

  .emma-tree-uninstall {
    color: var(--color-level-error, #c00);
    font-weight: bold;
  }

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

  .emma-tree-toggle,
  .emma-tree-update {
    width: 0.8rem;
    flex: none;
    text-align: center;
  }

  .emma-tree-update {
    color: var(--color-level-info, #5af);
  }

  .emma-tree-blocked {
    color: var(--color-level-error, #e55);
  }

  .emma-tree-hidden {
    opacity: 0.6;
  }

  .emma-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .emma-tree-title {
    flex: 1 1 auto;
    min-width: 4rem;
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

  /* What the plan changes, told apart by a dashed border as well as its colour, and by its tooltip. */
  .emma-status-planned {
    color: var(--color-level-info, #6af);
    border-style: dashed;
  }

  /* On the selected row's background, the status takes the row's own colour, which stays readable. */
  .emma-tree-row[aria-selected='true'] .emma-status {
    color: inherit;
  }
</style>
