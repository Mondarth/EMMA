<!--
  The panel for a world: its game system, what its record says it last ran with, what has changed since, and the modules
  it will need when next run that it did not run then.
-->
<script lang="ts">
  import { format, localize } from '../lib/i18n';
  import type { Difference, WorldOverview } from '../lib/overview';

  interface Props {
    world: WorldOverview;
  }

  let { world }: Props = $props();

  const recorded = $derived(
    world.record === undefined
      ? undefined
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(world.record.updated),
        ),
  );

  /**
   * Say what has changed.
   * @param difference - The change
   * @returns The text
   */
  function describe(difference: Difference): string {
    if (difference.kind === 'core') return format('World.CoreChange', difference);
    const { title, recorded: version, installed } = difference;
    return installed === undefined
      ? format('World.PackageGone', { title, recorded: version })
      : format('World.PackageChange', { title, recorded: version, installed });
  }
</script>

<h2>{world.world.title}</h2>
<p class={['emma-status', `emma-status-${world.status}`]}>{localize(`Status.${world.status}`)}</p>

<dl>
  <dt>{localize('World.System')}</dt>
  <dd>{world.system === undefined ? world.world.system : `${world.system.title} ${world.system.version}`}</dd>
  {#if world.record !== undefined}
    <dt>{localize('World.LastRan')}</dt>
    <dd>
      {format('World.LastRanWith', {
        core: world.record.core,
        system: world.record.system.title,
        version: world.record.system.version,
      })}
    </dd>
    <dt>{localize('World.Recorded')}</dt>
    <dd>{recorded}</dd>
    <dt>{localize('World.Modules')}</dt>
    <dd>{world.modules.length}</dd>
  {/if}
</dl>

{#if world.status === 'unrecorded'}
  <p class="emma-note">{localize('World.Unrecorded')}</p>
{:else if world.status === 'unreadable'}
  <p class="emma-note">{localize('World.Unreadable')}</p>
{/if}

{#if world.differences.length > 0}
  <section aria-labelledby="emma-setup-changes">
    <h3 id="emma-setup-changes">{localize('World.Changes')}</h3>
    <ul>
      {#each world.differences as difference, index (index)}
        <li>{describe(difference)}</li>
      {/each}
    </ul>
  </section>
{/if}

{#if world.needs.length > 0}
  <section aria-labelledby="emma-setup-needs">
    <h3 id="emma-setup-needs">{localize('World.Needs')}</h3>
    <ul>
      {#each world.needs as need (need.id)}
        <li>
          {format('World.Need', { title: need.title, modules: new Intl.ListFormat(undefined).format(need.by) })}
          {#if !need.installed}
            <span class="emma-status-missing">{localize('ModuleInfo.NotInstalled')}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

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

  .emma-status-matches {
    color: var(--color-level-success, #6c6);
  }

  .emma-status-differs,
  .emma-status-unrecorded {
    color: var(--color-level-warning, #ec3);
  }

  .emma-status-unreadable,
  .emma-status-missing {
    color: var(--color-level-error, #e55);
  }
</style>
