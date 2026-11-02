<!--
  The panel for a row that only groups others, such as the game systems or the modules for one system: what it holds,
  ten entries high at most, scrolling past that, and focusable, so that it can be scrolled from the keyboard too.
-->
<script lang="ts">
  import type { GroupDetail } from '../lib/details';

  interface Props {
    detail: GroupDetail;
  }

  let { detail }: Props = $props();
</script>

<h2>{detail.title}</h2>
{#if detail.note !== undefined}
  <p class="emma-note">{detail.note}</p>
{/if}
<ul class="emma-group-items" tabindex="0" aria-label={detail.title}>
  {#each detail.items as item, index (index)}
    <li>
      {item.title}
      {#if item.detail !== undefined}
        <span class="emma-group-detail">{item.detail}</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  /* Each entry one line high, unless its title wraps, so ten of them fill the list before it scrolls. */
  .emma-group-items {
    --emma-group-line: 1.5em;
    max-height: calc(10 * var(--emma-group-line));
    overflow-y: auto;
  }

  .emma-group-items li {
    line-height: var(--emma-group-line);
  }

  .emma-note {
    font-size: 0.9em;
    opacity: 0.85;
  }

  .emma-group-detail {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    opacity: 0.8;
  }
</style>
