<!--
  The panel for a game system: the version installed, the worlds that use it, and how many modules are for it.
-->
<script lang="ts">
  import type { SystemDetail } from '../lib/details';
  import { localize } from '../lib/i18n';

  interface Props {
    detail: SystemDetail;
  }

  let { detail }: Props = $props();
</script>

<h2>{detail.installed?.title ?? detail.id}</h2>

<dl>
  <dt>{localize('ModuleInfo.Installed')}</dt>
  <dd class={detail.installed === undefined ? 'emma-status-missing' : undefined}>
    {detail.installed?.version ?? localize('ModuleInfo.NotInstalled')}
  </dd>
  <dt>{localize('System.Modules')}</dt>
  <dd>{detail.modules}</dd>
</dl>

<section aria-labelledby="emma-setup-system-worlds">
  <h3 id="emma-setup-system-worlds">{localize('System.Worlds')}</h3>
  {#if detail.worlds.length === 0}
    <p class="emma-note">{localize('System.NoWorlds')}</p>
  {:else}
    <ul>
      {#each detail.worlds as title, index (index)}
        <li>{title}</li>
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

  .emma-status-missing {
    color: var(--color-level-error, #e55);
  }
</style>
