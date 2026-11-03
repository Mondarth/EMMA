<!--
  What a module recommends, below its panel: each module its manifest names as working with it, which it runs without,
  with a checkbox to want it with the module. Wanted, it comes into the plan with the module, unless it is installed
  (see `UpdateState.setRecommended`).
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';

  interface Props {
    /** The module's key. */
    key: string;
    updates: UpdateState;
  }

  let { key, updates }: Props = $props();

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
          <label>
            <input
              type="checkbox"
              checked={recommendation.wanted}
              disabled={updates.locked || recommendation.installed}
              aria-label={format('Recommends.Want', { title: recommendation.title, by: updates.titleOf(key) })}
              onchange={event => {
                void updates.setRecommended(key, recommendation.key, event.currentTarget.checked);
              }} />
            {recommendation.title}
          </label>
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

  .emma-recommends label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
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
