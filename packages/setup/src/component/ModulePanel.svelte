<!--
  The panel for a module a world runs: the version the world last ran with, the version installed, and the other
  recorded worlds that run it.
-->
<script lang="ts">
  import { format, localize } from '../lib/i18n';
  import type { WorldModule, WorldOverview } from '../lib/overview';

  interface Props {
    world: WorldOverview;
    entry: WorldModule;
    /** The titles of the worlds whose records say they run the module. */
    runBy: readonly string[];
  }

  let { world, entry, runBy }: Props = $props();
</script>

<h2>{entry.title}</h2>
<p>{format('ModuleInfo.InWorld', { world: world.world.title })}</p>

<dl>
  <dt>{localize('ModuleInfo.LastRan')}</dt>
  <dd>{entry.recorded}</dd>
  <dt>{localize('ModuleInfo.Installed')}</dt>
  <dd class={['emma-status', `emma-status-${entry.status}`]}>
    {entry.installed ?? localize('ModuleInfo.NotInstalled')}
  </dd>
</dl>

<section aria-labelledby="emma-setup-run-by">
  <h3 id="emma-setup-run-by">{localize('ModuleInfo.RunBy')}</h3>
  <ul>
    {#each runBy as title, index (index)}
      <li>{title}</li>
    {/each}
  </ul>
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
