<!--
  The panel for a world: its game system, what its record says it last ran with, what has changed since, and the modules
  it will need when next run that it did not run then.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { format, localize } from '../lib/i18n';
  import type { Difference, WorldOverview } from '../lib/overview';
  import type { TreeSelection } from '../lib/tree';

  import TreeLink from './TreeLink.svelte';

  interface Props {
    world: WorldOverview;
    /** Open the tree to a row a name links to, and select it; without it, names do not link. */
    onOpen?: ((link: TreeSelection) => void) | undefined;
    /** The actions on what it shows, such as Lock, Ignore and Uninstall, just below its title; none by default. */
    actions?: Snippet | undefined;
    /** Why no working setup was found for it, in the resolver's words, if none was. */
    unresolved?: readonly string[] | undefined;
  }

  let { world, onOpen, actions, unresolved }: Props = $props();

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
{@render actions?.()}
<p class={['emma-status', `emma-status-${world.status}`]}>{localize(`Status.${world.status}`)}</p>

{#if unresolved !== undefined}
  <section class="emma-world-unresolved" aria-labelledby="emma-world-unresolved">
    <h3 id="emma-world-unresolved">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" style:color="var(--color-level-error, #e55)"></i>
      {localize('World.Unresolved')}
    </h3>
    <p>{localize('World.UnresolvedHint')}</p>
    <ol style:padding-left="1.2rem" style:list-style="none">
      {#each unresolved as line, index (index)}
        <li>{line}</li>
      {/each}
    </ol>
  </section>
{/if}

<dl>
  <dt>{localize('World.System')}</dt>
  <dd>
    <TreeLink
      title={world.system?.title ?? world.world.system}
      link={{ kind: 'system', system: world.world.system }}
      {onOpen} />
    {world.system?.version ?? ''}
  </dd>
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
          <TreeLink title={need.title} link={{ kind: 'module', module: need.id }} {onOpen} />:
          {format('World.NeedBy', { modules: new Intl.ListFormat(undefined).format(need.by) })}
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
