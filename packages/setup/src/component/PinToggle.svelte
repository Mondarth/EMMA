<!--
  A pin toggle for one version of a package: pressed while that version is pinned (see `UpdateState.pin`). Pinning it
  unpins any other version of the package. Where the package cannot be pinned, it is disabled, its tooltip saying why.
  A click on it is its own, not the row's it is in.
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';

  import BusyMark from './BusyMark.svelte';

  interface Props {
    updates: UpdateState;
    /** The package's key. */
    key: string;
    /** Its title. */
    title: string;
    /** The version this toggle pins. */
    version: string;
    /** Whether to say what it does beside the pin, as a panel's action does, rather than in its tooltip alone. */
    labelled?: boolean;
  }

  let { updates, key, title, version, labelled = false }: Props = $props();

  const pinned = $derived(updates.pinnedOf(key) === version);
  const blocked = $derived(updates.pinBlockOf(key));
  const activity = $derived(updates.busy.activityOf(`pin:${key}`));
  /** What each reason a package cannot be pinned is called. */
  const BLOCKS = {
    locked: 'Pin.Blocked.Locked',
    ignored: 'Pin.Blocked.Ignored',
    'core-locked': 'Pin.Blocked.CoreLocked',
    running: 'Pin.Blocked.Running',
  } as const;
  const label = $derived(
    blocked === undefined ? format(pinned ? 'Pin.Unpin' : 'Pin.Pin', { title, version }) : localize(BLOCKS[blocked]),
  );
</script>

<button
  type="button"
  class={['emma-pin', 'emma-busy-host', { 'emma-pin-pressed': pinned, 'emma-pin-labelled': labelled }]}
  aria-pressed={pinned}
  aria-label={labelled ? undefined : label}
  data-tooltip={label}
  aria-busy={activity !== undefined}
  disabled={blocked !== undefined || activity !== undefined}
  onclick={event => {
    event.stopPropagation();
    void updates.busy.run(`pin:${key}`, 'planning', () => (pinned ? updates.unpin(key) : updates.pin(key, version)));
  }}>
  <i class="fa-solid fa-thumbtack" aria-hidden="true"></i>
  {#if labelled}{label}{/if}
  <BusyMark {activity} />
</button>

<style>
  .emma-pin {
    flex: none;
    width: auto;
    min-width: 0;
    padding: 0 0.35rem;
    line-height: inherit;
    opacity: 0.55;
  }

  .emma-pin:not(.emma-pin-labelled) {
    border: none;
    background: none;
    box-shadow: none;
  }

  .emma-pin:hover:not(:disabled),
  .emma-pin-labelled {
    opacity: 1;
  }

  /* Pinned: upright and coloured, where an unpinned one is faint and tilted. */
  .emma-pin i {
    transform: rotate(45deg);
  }

  .emma-pin-pressed {
    opacity: 1;
    color: var(--color-warm-1, #ff6400);
  }

  .emma-pin-pressed i {
    transform: none;
  }

  .emma-pin:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
