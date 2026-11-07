<!--
  What is held as it is, in the root's panel under Plan Updates: what is locked and what is ignored, side by side, each
  list five entries high, scrolling past that. Each entry links to its row in the tree, and has a toggle beside it to
  unlock it or stop ignoring it at once, as its own panel's button does. A list with nothing in it is not shown, nor is
  the block with nothing in either.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import type { HeldItem } from '../lib/held';
  import { format, localize } from '../lib/i18n';
  import type { TreeSelection } from '../lib/tree';

  import BusyMark from './BusyMark.svelte';
  import TreeLink from './TreeLink.svelte';

  interface Props {
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

  let { locked, ignored, disabled, busy, onUnlock, onUnignore, onOpen }: Props = $props();

  const uid = $props.id();
</script>

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
            <span class="emma-held-title"><TreeLink title={item.title} link={item.link} {onOpen} /></span>
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

{#if locked.length > 0 || ignored.length > 0}
  <div class="emma-held" role="group" aria-label={localize('Held.Label')}>
    {@render list('locked', localize('Held.Locked'), locked, true)}
    {@render list('ignored', localize('Held.Ignored'), ignored, false)}
  </div>
{/if}

<style>
  /* Side by side, each list taking half, wrapping one under the other only where the panel is too narrow. */
  .emma-held {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin: 0.5rem 0 0.75rem;
  }

  .emma-held-list {
    flex: 1 1 12rem;
    min-width: 0;
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
