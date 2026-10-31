<!--
  The panel for a game system, wherever the tree shows it: the version installed, and the version a world last ran with
  if it shows under one; the worlds that use it, each with the version it last ran with; and how many modules are for it.
-->
<script lang="ts">
  import type { ExplainedVersion } from '../app/update-state.svelte';
  import type { SystemDetail } from '../lib/details';
  import type { BlockedUpdate as Blocked } from '../lib/updates';

  import BlockedUpdate from './BlockedUpdate.svelte';
  import VersionExplanation from './VersionExplanation.svelte';
  import { format, localize } from '../lib/i18n';

  interface Props {
    detail: SystemDetail;
    /** A newer version EMMA cannot offer, if there is one. */
    blocked?: Blocked | undefined;
    /** The version looked at in its list, or chosen, to explain, if any. */
    explained?: ExplainedVersion | undefined;
  }

  let { detail, blocked, explained }: Props = $props();
</script>

<h2>{detail.title}</h2>
{#if detail.world !== undefined}
  <p>{format('ModuleInfo.InWorld', { world: detail.world.world.title })}</p>
{/if}

<dl>
  {#if detail.ran !== undefined}
    <dt>{localize('ModuleInfo.LastRan')}</dt>
    <dd>{detail.ran.recorded}</dd>
  {/if}
  <dt>{localize('ModuleInfo.Installed')}</dt>
  <dd class={['emma-status', `emma-status-${detail.status}`]}>
    {detail.installed?.version ?? localize('ModuleInfo.NotInstalled')}
  </dd>
  <dt>{localize('System.Modules')}</dt>
  <dd>{detail.modules}</dd>
</dl>

{#if explained !== undefined}
  <VersionExplanation {explained} />
{/if}

{#if blocked !== undefined}
  <BlockedUpdate {blocked} />
{/if}

<section aria-labelledby="emma-setup-system-worlds">
  <h3 id="emma-setup-system-worlds">{localize('System.Worlds')}</h3>
  {#if detail.worlds.length === 0}
    <p class="emma-note">{localize('System.NoWorlds')}</p>
  {:else}
    <ul>
      {#each detail.worlds as world, index (index)}
        <li>
          {world.title}
          {#if world.ran !== undefined}
            <span class="emma-note">{format('System.RanWith', { version: world.ran.recorded })}</span>
            <span class={['emma-badge', `emma-status-${world.ran.status}`]}>
              {localize(`Module.${world.ran.status}`)}
            </span>
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

  .emma-note {
    font-size: 0.9em;
    opacity: 0.85;
  }

  .emma-badge {
    font-size: 0.8em;
    padding: 0 0.3rem;
    border-radius: 3px;
    border: 1px solid currentColor;
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
