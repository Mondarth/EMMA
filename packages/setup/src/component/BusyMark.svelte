<!--
  The spinner and the word laid over an item while EMMA works on what the user did to it (see `app/busy.svelte.ts`).
  Placed inside the item, which takes `emma-busy-host`, it covers the item until the work is done; a button it is in
  is disabled meanwhile, so that the work is not asked for twice. Nothing while there is no activity.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import { localize } from '../lib/i18n';

  interface Props {
    /** What EMMA is busy with; nothing is shown without one. */
    activity: Activity | undefined;
  }

  const { activity }: Props = $props();
</script>

{#if activity !== undefined}
  <span class="emma-busy" role="status">
    <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
    {localize(`Busy.${activity.charAt(0).toUpperCase()}${activity.slice(1)}`)}
  </span>
{/if}

<style>
  :global(.emma-busy-host) {
    position: relative;
  }

  .emma-busy {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35em;
    border-radius: inherit;
    background: var(--color-cool-5-75, rgba(11, 10, 19, 0.75));
    color: var(--color-light-1, #f0f0e0);
    font-size: 0.85em;
    white-space: nowrap;
    cursor: progress;
  }
</style>
