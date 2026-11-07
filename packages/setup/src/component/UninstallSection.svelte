<!--
  Uninstalling a game system or module, among the actions at the top of its panel: a button to put it in the plan, or
  take it out again, and what it would break. In standard mode, an uninstall that would break something known is
  refused, saying why below the button, always; what EMMA cannot know, it warns of where it says what uninstalling does.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import type { UninstallOffer } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';
  import { blockText, warningText } from '../lib/uninstall';

  import ActionItem from './ActionItem.svelte';
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

  const refused = $derived(offer.effects.blocks.length > 0 && !offer.planned);
</script>

{#snippet button()}
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
{/snippet}

{#snippet why()}
  <p class="emma-uninstall-refused">{format('Uninstall.Refused', { title })}</p>
  <ul>
    {#each offer.effects.blocks as block, index (index)}
      <li>{blockText(block)}</li>
    {/each}
  </ul>
{/snippet}

{#snippet about()}
  <p>{offer.planned ? format('Uninstall.Planned', { title }) : localize('Uninstall.NoUndo')}</p>
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
{/snippet}

<ActionItem
  label={localize('Uninstall.Heading')}
  {button}
  {about}
  shown={refused ? why : undefined}
  warning={!refused && offer.effects.warnings.length > 0} />

<style>
  .emma-uninstall-refused {
    color: var(--color-level-error, #c00);
  }

  .emma-uninstall-warning i {
    color: var(--color-level-warning, #ec3);
  }
</style>
