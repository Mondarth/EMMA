<!--
  The panel for a row that only groups others, such as the game systems or the modules for one system: what it holds.
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
<ul>
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
