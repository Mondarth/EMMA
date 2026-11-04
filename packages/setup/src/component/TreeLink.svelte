<!--
  A name in a panel that links to its row in the installation tree: clicked, the tree opens to it and selects it (see
  `InstallationTree.reveal`). Without a way to open it, the name alone.
-->
<script lang="ts">
  import { format } from '../lib/i18n';
  import type { TreeSelection } from '../lib/tree';

  interface Props {
    /** The name. */
    title: string;
    /** The row it names. */
    link: TreeSelection;
    /** Open the tree to the row, and select it. */
    onOpen?: ((link: TreeSelection) => void) | undefined;
  }

  let { title, link, onOpen }: Props = $props();
</script>

{#if onOpen === undefined}
  {title}
{:else}
  <button
    type="button"
    class="emma-tree-link"
    aria-label={format('Tree.Show', { title })}
    onclick={() => {
      onOpen(link);
    }}>{title}</button>
{/if}

<style>
  .emma-tree-link {
    display: inline;
    width: auto;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-hyperlink, #ff6400);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .emma-tree-link:focus-visible {
    outline: 2px solid var(--color-border-highlight, #ff6400);
  }
</style>
