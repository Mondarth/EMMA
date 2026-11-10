<!--
  What is held as it is, in the root's panel under Plan Updates: what is locked and what is ignored, side by side, each
  list five entries high, scrolling past that. Each entry links to its row in the tree, and has a toggle beside it to
  unlock it or stop ignoring it at once, as its own panel's button does. A list with nothing in it is not shown, nor is
  the block with nothing in either.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import type { HeldItem, PinnedItem } from '../lib/held';
  import { format, localize } from '../lib/i18n';
  import type { TreeSelection } from '../lib/tree';

  import BusyMark from './BusyMark.svelte';
  import TreeLink from './TreeLink.svelte';

  interface Props {
    /** What is pinned, each at its version. */
    pinned: readonly PinnedItem[];
    /** Unpin an item. */
    onUnpin?: (key: string) => void;
    /** What EMMA is busy with for an item's pin. */
    pinBusy?: (key: string) => Activity | undefined;
    /** What is locked; none where nothing can be unlocked here. */
    locked: readonly HeldItem[];
    /** What is ignored; none where nothing can be unignored here. */
    ignored: readonly HeldItem[];
    /** Whether nothing can change now, as while the plan runs. */
    disabled: boolean;
    /** What EMMA is busy with for an item's toggle, by the item's key and whether it is the lock's. */
    busy: (key: string, lock: boolean) => Activity | undefined;
    /** Unlock an item. */
    onUnlock: (key: string) => void;
    /** Stop ignoring an item. */
    onUnignore: (key: string) => void;
    /** Open the tree to an item's row, and select it. */
    onOpen?: ((link: TreeSelection) => void) | undefined;
  }

  let { pinned, onUnpin, pinBusy, locked, ignored, disabled, busy, onUnlock, onUnignore, onOpen }: Props = $props();

  const uid = $props.id();
</script>

<!-- The user's note on an item, after its title, as the tree shows it. -->
{#snippet noted(note: string | undefined)}
  {#if note !== undefined}
    <span class="emma-held-note" data-tooltip={note}>[{note}]</span>
  {/if}
{/snippet}

{#snippet list(id: string, heading: string, items: readonly HeldItem[], lock: boolean)}
  {#if items.length > 0}
    <div class="emma-held-list">
      <h4 id="{uid}-{id}">{heading}</h4>
      <!-- A list that scrolls is reached from the keyboard to scroll it. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <ul tabindex="0" aria-labelledby="{uid}-{id}">
        {#each items as item (item.key)}
          {@const activity = busy(item.key, lock)}
          {@const label = format(lock ? 'Held.Unlock' : 'Held.Unignore', { title: item.title })}
          <li>
            <span class="emma-held-title">
              <TreeLink title={item.title} link={item.link} {onOpen} />
              {@render noted(item.note)}
            </span>
            <button
              type="button"
              class="emma-held-toggle emma-busy-host"
              aria-label={label}
              data-tooltip={label}
              aria-busy={activity !== undefined}
              disabled={disabled || activity !== undefined}
              onclick={() => {
                if (lock) onUnlock(item.key);
                else onUnignore(item.key);
              }}>
              <i class={['fa-solid', lock ? 'fa-lock' : 'fa-eye-slash']} aria-hidden="true"></i>
              <BusyMark {activity} />
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

<!-- What is pinned, each with its version, and in red, saying why, where the plan leaves it out. -->
{#snippet pinnedList()}
  {#if pinned.length > 0}
    <div class="emma-held-list">
      <h4 id="{uid}-pinned">{localize('Pin.Pinned')}</h4>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <ul tabindex="0" aria-labelledby="{uid}-pinned">
        {#each pinned as item (item.key)}
          {@const activity = pinBusy?.(item.key)}
          {@const label = format('Pin.Unpin', { title: item.title, version: item.version })}
          <li class={{ 'emma-held-unmet': item.problem !== undefined }} data-tooltip={item.problem}>
            <span class="emma-held-title">
              <TreeLink title={item.title} link={item.link} {onOpen} />
              <span class="emma-held-version">{item.version}</span>
              {@render noted(item.note)}
              {#if item.problem !== undefined}
                <span class="emma-visually-hidden">{item.problem}</span>
              {/if}
            </span>
            <button
              type="button"
              class="emma-held-toggle emma-busy-host"
              aria-label={label}
              data-tooltip={label}
              aria-busy={activity !== undefined}
              disabled={disabled || activity !== undefined}
              onclick={() => {
                onUnpin?.(item.key);
              }}>
              <i class="fa-solid fa-thumbtack" aria-hidden="true"></i>
              <BusyMark {activity} />
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

{#if pinned.length > 0 || locked.length > 0 || ignored.length > 0}
  <!-- Its width, which the lists' columns follow, rather than the window's. -->
  <div class="emma-held-box">
    <div class="emma-held" role="group" aria-label={localize('Held.Label')}>
      {@render pinnedList()}
      {@render list('locked', localize('Held.Locked'), locked, true)}
      {@render list('ignored', localize('Held.Ignored'), ignored, false)}
    </div>
  </div>
{/if}

<style>
  .emma-held-note {
    font-size: 0.85em;
    opacity: 0.7;
  }

  .emma-held-box {
    container-type: inline-size;
    margin: 0.5rem 0 0.75rem;
  }

  /* Side by side, each list a third of the width, even alone; one under the other, each the full width, where too narrow. */
  .emma-held {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* A wide gutter, so that a list's toggles read as its own, not the next list's entries. */
    gap: 0.5rem 2.5rem;
  }

  @container (width < 36rem) {
    .emma-held {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .emma-held-list {
    min-width: 0;
  }

  .emma-held-version {
    margin-left: 0.35em;
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    opacity: 0.8;
  }

  /* A pin the plan leaves out, its tooltip saying why. */
  .emma-held-unmet,
  .emma-held-unmet :global(.emma-tree-link) {
    color: var(--color-level-error, #e55);
  }

  .emma-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .emma-held-list h4 {
    margin: 0 0 0.25rem;
  }

  /* Five entries high, each one line, scrolling past that. */
  .emma-held-list ul {
    --emma-held-line: 1.75em;
    max-height: calc(5 * var(--emma-held-line));
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .emma-held-list li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: var(--emma-held-line);
  }

  .emma-held-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .emma-held-toggle {
    flex: none;
    width: auto;
    min-width: 0;
    padding: 0 0.4rem;
    line-height: calc(var(--emma-held-line) - 0.25em);
  }
</style>
