<script module lang="ts">
  import type { Snippet } from 'svelte';

  /** Declared here so that the component's type, which names it, can be emitted. */
  export interface CountedListProps<Item> {
    /** The items, at least one. */
    items: readonly Item[];
    /** The dropdown's summary, naming how many there are, shown when there are several. */
    summary: string;
    /** Renders one item. */
    item: Snippet<[Item]>;
  }
</script>

<script lang="ts" generics="T">
  const { items, summary, item }: CountedListProps<T> = $props();
</script>

<!-- One item is shown inline; several are listed in a dropdown, closed to begin with. -->
{#if items.length === 1}
  {#each items as each, index (index)}
    {@render item(each)}
  {/each}
{:else}
  <details>
    <summary>{summary}</summary>
    <ul>
      {#each items as each, index (index)}
        <li>{@render item(each)}</li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  summary {
    cursor: pointer;
  }

  ul {
    margin: 0.25rem 0 0;
    padding-left: 1rem;
  }
</style>
