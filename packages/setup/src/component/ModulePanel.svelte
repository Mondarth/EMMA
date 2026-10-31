<!--
  The panel for a module, wherever the tree shows it: the version installed, and the version a world last ran with if it
  shows under one; the game systems it is for; the modules it requires, and those that require it; and the recorded
  worlds it is active in, or that will need it when next run as what they run now requires it.
-->
<script lang="ts">
  import type { ExplainedVersion } from '../app/update-state.svelte';
  import type { ModuleDetail, RelatedPackage } from '../lib/details';
  import type { BlockedUpdate as Blocked } from '../lib/updates';

  import BlockedUpdate from './BlockedUpdate.svelte';
  import VersionExplanation from './VersionExplanation.svelte';
  import { format, localize } from '../lib/i18n';

  interface Props {
    detail: ModuleDetail;
    /** A newer version EMMA cannot offer, if there is one. */
    blocked?: Blocked | undefined;
    /** The version looked at in its list, or chosen, to explain, if any. */
    explained?: ExplainedVersion | undefined;
  }

  let { detail, blocked, explained }: Props = $props();
</script>

{#snippet packages(list: readonly RelatedPackage[])}
  <ul>
    {#each list as related (related.id)}
      <li>
        {related.title}
        {#if !related.installed}
          <span class="emma-status-missing">{localize('ModuleInfo.NotInstalled')}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet titles(list: readonly string[])}
  <ul>
    {#each list as title, index (index)}
      <li>{title}</li>
    {/each}
  </ul>
{/snippet}

<h2>{detail.title}</h2>
{#if detail.world !== undefined}
  <p>{format('ModuleInfo.InWorld', { world: detail.world.world.title })}</p>
{/if}

<dl>
  {#if detail.run !== undefined}
    <dt>{localize('ModuleInfo.LastRan')}</dt>
    <dd>{detail.run.recorded}</dd>
  {/if}
  <dt>{localize('ModuleInfo.Installed')}</dt>
  <dd class={['emma-status', `emma-status-${detail.status}`]}>
    {detail.installed?.version ?? localize('ModuleInfo.NotInstalled')}
  </dd>
  {#if detail.installed !== undefined}
    <dt>{localize('ModuleInfo.Systems')}</dt>
    <dd>
      {#if detail.systems.length === 0}
        {localize('ModuleInfo.AnySystem')}
      {:else}
        {@render packages(detail.systems)}
      {/if}
    </dd>
  {/if}
</dl>

{#if explained !== undefined}
  <VersionExplanation {explained} />
{/if}

{#if blocked !== undefined}
  <BlockedUpdate {blocked} />
{/if}

{#if detail.requires.length > 0}
  <section aria-labelledby="emma-setup-requires">
    <h3 id="emma-setup-requires">{localize('ModuleInfo.Requires')}</h3>
    {@render packages(detail.requires)}
  </section>
{/if}

{#if detail.requiredBy.length > 0}
  <section aria-labelledby="emma-setup-required-by">
    <h3 id="emma-setup-required-by">{localize('ModuleInfo.RequiredBy')}</h3>
    {@render titles(detail.requiredBy)}
  </section>
{/if}

<section aria-labelledby="emma-setup-active-in">
  <h3 id="emma-setup-active-in">{localize('ModuleInfo.ActiveIn')}</h3>
  {#if detail.activeIn.length === 0}
    <p class="emma-note">{localize('ModuleInfo.ActiveInNone')}</p>
  {:else}
    <ul>
      {#each detail.activeIn as world, index (index)}
        <li>
          {world.title}
          {#if world.needed !== undefined}
            <p class="emma-note">
              {format('ModuleInfo.NeededNext', { modules: new Intl.ListFormat(undefined).format(world.needed) })}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  dl {
    display: grid;
    grid-template-columns: max-content auto;
    gap: 0.2rem 1rem;
  }

  dt {
    font-weight: bold;
  }

  dd {
    margin: 0;
  }

  dd ul {
    margin: 0;
    padding-left: 1rem;
  }

  .emma-note {
    font-size: 0.9em;
    opacity: 0.85;
  }

  .emma-status-same {
    color: var(--color-level-success, #6c6);
  }

  .emma-status-other {
    color: var(--color-level-warning, #ec3);
  }

  .emma-status-missing {
    color: var(--color-level-error, #e55);
  }
</style>
