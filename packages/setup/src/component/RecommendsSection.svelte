<!--
  What a module recommends, below its panel: each module its manifest names as working with it, which it runs without,
  with a checkbox to want it with the module. Wanted, it comes into the plan with the module, unless it is installed
  (see `UpdateState.setRecommended`).
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';
  import type { TreeSelection } from '../lib/tree';

  import TreeLink from './TreeLink.svelte';

  interface Props {
    /** The module's key. */
    key: string;
    updates: UpdateState;
    /** Open the tree to a row a name links to, and select it; without it, names do not link. */
    onOpen?: ((link: TreeSelection) => void) | undefined;
  }

  let { key, updates, onOpen }: Props = $props();

  const uid = $props.id();
  const recommended = $derived(updates.recommendationsOf(key));
</script>

{#snippet rejected(why: { readonly reason: string; readonly explanation?: readonly string[] })}
  <div class="emma-recommends-rejected">
    <p>{format('Recommends.Rejected', { reason: why.reason })}</p>
    {#if why.explanation !== undefined}
      <ul>
        {#each why.explanation as line, index (index)}
          <li>{line}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

{#if recommended.length > 0}
  <section class="emma-recommends" aria-labelledby="{uid}-heading">
    <h3 id="{uid}-heading">{localize('Recommends.Heading')}</h3>
    <p class="emma-recommends-hint">{localize('Recommends.Hint')}</p>
    <ul>
      {#each recommended as recommendation (recommendation.key)}
        <li>
          <!-- The checkbox has its own name, so that the module's name beside it can link to it in the tree. -->
          <input
            type="checkbox"
            checked={recommendation.wanted}
            disabled={updates.locked || recommendation.installed}
            aria-label={format('Recommends.Want', { title: recommendation.title, by: updates.titleOf(key) })}
            onchange={event => {
              void updates.setRecommended(key, recommendation.key, event.currentTarget.checked);
            }} />
          <TreeLink
            title={recommendation.title}
            link={{ kind: 'module', module: recommendation.key.slice(recommendation.key.indexOf(':') + 1) }}
            {onOpen} />
          <span class="emma-recommends-state"
            >{localize(recommendation.installed ? 'Module.same' : 'Module.missing')}</span>
          {#if recommendation.rejected !== undefined}
            {@render rejected(recommendation.rejected)}
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .emma-recommends {
    margin-top: 1rem;
  }

  .emma-recommends > ul {
    list-style: none;
    padding-left: 0;
  }

  .emma-recommends input[type='checkbox'] {
    margin: 0 0.5rem 0 0;
    vertical-align: middle;
  }

  .emma-recommends-rejected {
    color: var(--color-level-error, #c00);
    font-size: 0.85em;
  }

  .emma-recommends-rejected p {
    margin: 0;
  }

  .emma-recommends-hint,
  .emma-recommends-state {
    font-size: 0.85em;
    opacity: 0.85;
  }
</style>
