<!--
  The panel for the tree's root: the Foundry version, a summary of the worlds and the modules installed, and whether
  EMMA guards Foundry's own package buttons.
-->
<script lang="ts">
  import { format, localize } from '../lib/i18n';
  import type { Overview, WorldStatus } from '../lib/overview';

  interface Props {
    overview: Overview;
    guardOn: boolean;
    onGuardChange: (on: boolean) => void;
  }

  let { overview, guardOn, onGuardChange }: Props = $props();

  const STATUSES: readonly WorldStatus[] = ['matches', 'differs', 'unrecorded', 'unreadable'];
  const worlds = $derived(overview.summary.worlds);
  const modules = $derived(overview.summary.modules);
</script>

<h2>{format('Root.Heading', { version: overview.core })}</h2>

<section aria-labelledby="emma-setup-worlds">
  <h3 id="emma-setup-worlds">{localize('Root.Worlds')}</h3>
  <dl>
    <dt>{localize('Root.Installed')}</dt>
    <dd>{worlds.total}</dd>
    {#each STATUSES as status (status)}
      {#if worlds.byStatus[status] > 0}
        <dt>{localize(`Status.${status}`)}</dt>
        <dd>{worlds.byStatus[status]}</dd>
      {/if}
    {/each}
  </dl>
  {#if worlds.systems.length > 0}
    <h4>{localize('Root.Systems')}</h4>
    <ul>
      {#each worlds.systems as system (system.id)}
        <li>{format('Root.SystemCount', { title: system.title, count: system.count })}</li>
      {/each}
    </ul>
  {/if}
  {#if worlds.byStatus.unrecorded > 0}
    <p class="emma-note">{localize('Root.UnrecordedNote')}</p>
  {/if}
</section>

<section aria-labelledby="emma-setup-modules">
  <h3 id="emma-setup-modules">{localize('Root.Modules')}</h3>
  <dl>
    <dt>{localize('Root.Installed')}</dt>
    <dd>{modules.total}</dd>
    <dt>{localize('Root.Used')}</dt>
    <dd>{modules.used}</dd>
    <dt>{localize('Root.Unused')}</dt>
    <dd>{modules.unused}</dd>
  </dl>
  {#if modules.pending > 0}
    <p class="emma-note">{format('Root.PendingNote', { count: modules.pending })}</p>
  {/if}
  {#if worlds.byStatus.unrecorded > 0}
    <p class="emma-note">{localize('Root.UnusedNote')}</p>
  {/if}
</section>

<section class="emma-guard">
  <label>
    <input
      type="checkbox"
      checked={!guardOn}
      onchange={event => {
        onGuardChange(!event.currentTarget.checked);
      }} />
    {localize('Root.Guard')}
  </label>
  <p class="emma-note">{localize('Root.GuardHint')}</p>
</section>

<style>
  dl {
    display: grid;
    grid-template-columns: max-content auto;
    gap: 0.2rem 1rem;
    margin: 0.5rem 0;
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

  .emma-guard {
    margin-top: 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #555);
  }
</style>
