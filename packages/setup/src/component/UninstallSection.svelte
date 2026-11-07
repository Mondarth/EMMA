<!--
  Uninstalling a game system or module, below its panel: what it would break, then a button to put it in the plan, or
  take it out again. In standard mode, an uninstall that would break something known is refused, saying why; what EMMA
  cannot know, it warns of.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import type { UninstallOffer } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';
  import { blockText, warningText } from '../lib/uninstall';

  import BusyMark from './BusyMark.svelte';

  interface Props {
    /** The package's title. */
    title: string;
    offer: UninstallOffer;
    /** Whether the choices cannot change, as while the plan runs. */
    locked: boolean;
    /** Put the uninstall in the plan, or take it out. */
    onChoose: (uninstall: boolean) => void;
    /** What EMMA is busy with because of this section's button, shown over it; nothing by default. */
    busy?: Activity | undefined;
  }

  let { title, offer, locked, onChoose, busy }: Props = $props();

  const uid = $props.id();
  const refused = $derived(offer.effects.blocks.length > 0 && !offer.planned);
</script>

<section class="emma-uninstall" aria-labelledby="{uid}-heading">
  <h3 id="{uid}-heading">{localize('Uninstall.Heading')}</h3>
  {#if offer.planned}
    <p>{format('Uninstall.Planned', { title })}</p>
  {:else if refused}
    <p class="emma-uninstall-refused">{format('Uninstall.Refused', { title })}</p>
    <ul>
      {#each offer.effects.blocks as block, index (index)}
        <li>{blockText(block)}</li>
      {/each}
    </ul>
  {:else}
    <p>{localize('Uninstall.NoUndo')}</p>
  {/if}
  {#if !refused && offer.effects.warnings.length > 0}
    <p class="emma-uninstall-warning">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      {localize('Uninstall.Warnings')}
    </p>
    <ul>
      {#each offer.effects.warnings as warning, index (index)}
        <li>{warningText(warning)}</li>
      {/each}
    </ul>
  {/if}
  {#if offer.planned}
    <button
      type="button"
      class="emma-busy-host"
      aria-busy={busy !== undefined}
      disabled={locked || busy !== undefined}
      onclick={() => {
        onChoose(false);
      }}>
      <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
      {format('Uninstall.Keep', { title })}
      <BusyMark activity={busy} />
    </button>
  {:else}
    <button
      type="button"
      class="emma-busy-host"
      aria-busy={busy !== undefined}
      disabled={locked || refused || busy !== undefined}
      onclick={() => {
        onChoose(true);
      }}>
      <i class="fa-solid fa-trash" aria-hidden="true"></i>
      {format('Uninstall.Button', { title })}
      <BusyMark activity={busy} />
    </button>
  {/if}
</section>

<style>
  .emma-uninstall {
    margin-top: 1rem;
  }

  .emma-uninstall-refused {
    color: var(--color-level-error, #c00);
  }

  .emma-uninstall-warning i {
    color: var(--color-level-warning, #ec3);
  }

  .emma-uninstall button {
    width: auto;
  }
</style>
