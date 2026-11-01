<!--
  Where a run of the update plan stops: Foundry VTT's own update. It warns against updating in place, and points to
  Foundry's guide to testing an update first. Updating in place is offered only where Foundry's updater can install
  the build the plan chose: not when the server was started with in-place updates switched off, nor when the updater
  would install another build, as it installs only the newest on its channel, nor a build Foundry installs only by
  hand. Even then, the user must type a code shown, so that it is not done by a slip.
-->
<script lang="ts">
  import { coreRefusal } from '../app/core-refusal';
  import type { CoreTargetState, CoreUpdating } from '../app/setup-state.svelte';
  import type { CoreUpdateState } from '../foundry/setup-game';
  import { format, localize } from '../lib/i18n';

  interface Props {
    /** The build the plan chose. */
    version: string;
    /** Whether Foundry can update itself in place, and its channel. */
    core: CoreUpdateState;
    /** The build Foundry's updater would install, as far as it is known. */
    target: CoreTargetState;
    /** Where updating in place has got, once begun. */
    updating: CoreUpdating | null;
    /** Update in place, once the code is typed. */
    onUpdate: () => void;
  }

  let { version, core, target, updating, onUpdate }: Props = $props();

  /** Foundry's guide to updating, which shows how to test an update on a separate install first. */
  const GUIDE = 'https://foundryvtt.com/article/updating/';
  /** The characters a code is made of. */
  const CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  const uid = $props.id();
  /** The code to type, six letters and digits at random. */
  const code = Array.from(
    crypto.getRandomValues(new Uint32Array(6)),
    n => CODE_CHARACTERS[n % CODE_CHARACTERS.length],
  ).join('');
  let typed = $state('');

  /** Why updating in place cannot be offered, if it cannot; not yet, while Foundry is asked which build. */
  const refusal = $derived(
    core.canUpdate && (target === null || target === 'checking')
      ? localize('Core.Checking')
      : coreRefusal(version, core, target),
  );
</script>

<section class="emma-core-step" aria-labelledby="{uid}-heading">
  <h4 id="{uid}-heading">{format('Core.Heading', { version })}</h4>
  <p class="emma-core-warning">
    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
    {localize('Core.Warning')}
  </p>
  <p>
    {localize('Core.Test')}
    <a href={GUIDE} target="_blank" rel="noopener noreferrer">{localize('Core.Guide')}</a>
  </p>
  {#if updating?.kind === 'begun'}
    <p role="status">
      {format('Core.Begun', { version: updating.version })}
      {localize(updating.kept ? 'Core.Kept' : 'Core.NotKept')}
    </p>
  {:else if refusal !== undefined}
    <p class="emma-core-refusal">{refusal}</p>
  {:else}
    <p>{format('Core.Confirm', { version })}</p>
    <p>
      <label>
        {format('Core.TypeCode', { code })}
        <input
          type="text"
          autocomplete="off"
          spellcheck="false"
          value={typed}
          oninput={event => {
            typed = event.currentTarget.value;
          }} />
      </label>
    </p>
    <button type="button" class="emma-core-update" disabled={typed.trim().toUpperCase() !== code} onclick={onUpdate}>
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      {format('Core.Update', { version })}
    </button>
    {#if updating?.kind === 'failed'}
      <p class="emma-core-refusal">{format('Core.Failed', { message: updating.message })}</p>
    {/if}
  {/if}
</section>

<style>
  .emma-core-step {
    margin: 0.5rem 0;
    padding: 0.5rem;
    border: 2px solid var(--color-level-error, #c00);
    border-radius: 4px;
  }

  .emma-core-warning,
  .emma-core-refusal {
    color: var(--color-level-error, #c00);
  }

  .emma-core-warning {
    font-weight: bold;
  }

  .emma-core-update {
    width: auto;
  }
</style>
