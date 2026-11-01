<!--
  Why a version of a package is badged as it is, in the panel for the package: the version the user is looking at in its
  list, or else the one chosen. Its badge, and its explanation; for a package more than one recorded world uses, each
  world's badge and explanation, of which the version's badge is the worst.
-->
<script lang="ts">
  import type { ExplainedVersion } from '../app/update-state.svelte';
  import { explanationLines } from '../lib/explanation';
  import { format, localize } from '../lib/i18n';

  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    explained: ExplainedVersion;
  }

  let { explained }: Props = $props();

  const option = $derived(explained.option);
  const heading = $derived(
    format(option.version === explained.installed ? 'Update.ExplainedInstalled' : 'Update.Explained', {
      version: option.version,
    }),
  );
</script>

{#snippet lines(tooltip: string)}
  <ul class="emma-explanation-lines">
    {#each explanationLines(tooltip) as line, index (index)}
      <li>{line}</li>
    {/each}
  </ul>
{/snippet}

<section class="emma-explanation" aria-labelledby="emma-setup-explained" aria-live="polite">
  <h3 id="emma-setup-explained">{heading}</h3>
  <p><VersionBadge version={option.version} badge={option.badge} unlisted={option.unlisted === true} /></p>
  {#if option.missingManifest === true}
    <p class="emma-explanation-conflict">{localize('Update.NoManifestExplained')}</p>
  {:else if option.conflict !== undefined}
    <p class="emma-explanation-conflict">
      {format('Update.TakeOut', {
        choices: option.conflict.remove.map(choice => format('Update.Choice', choice)).join(', '),
      })}
    </p>
    {#if option.conflict.explanation.length > 0}
      <p>{localize('Update.Why')}</p>
      <ul class="emma-explanation-lines">
        {#each option.conflict.explanation as line, index (index)}
          <li>{line}</li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if option.needs !== undefined}
    <p>{localize('Update.Needs')}</p>
    <ul class="emma-explanation-lines">
      {#each option.needs as need, index (index)}
        <li>{need}</li>
      {/each}
    </ul>
  {/if}
  {#if option.brings !== undefined}
    <p>{localize('Update.Brings')}</p>
    <ul class="emma-explanation-brings">
      {#each option.brings as brought, index (index)}
        <li>{format('Update.BringsItem', brought)}</li>
      {/each}
    </ul>
  {/if}
  {#if option.worlds !== undefined}
    <ul>
      {#each option.worlds as world, index (index)}
        <li>
          <strong>{world.title}</strong>
          <VersionBadge version={option.version} badge={world.badge} />
          {#if world.badge !== null}{@render lines(world.badge.tooltip)}{/if}
        </li>
      {/each}
    </ul>
  {:else if option.badge !== null}
    {@render lines(option.badge.tooltip)}
  {:else}
    <p class="emma-note">{localize('Update.NoVerdict')}</p>
  {/if}
</section>

<style>
  .emma-explanation-conflict {
    color: var(--color-level-error, #e55);
  }

  .emma-explanation-lines {
    margin: 0.2rem 0;
    padding-left: 1.2rem;
  }
</style>
