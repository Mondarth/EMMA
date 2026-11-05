<!--
  Planning the best versions there are, below the root's panel: the newest of Foundry VTT and of every game system and
  module installed that the plan can take together, in place of what was chosen before (see `UpdateState.planBest`).
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { localize } from '../lib/i18n';

  interface Props {
    updates: UpdateState;
    /** Whether the plan cannot change now, as while it runs. */
    disabled: boolean;
    /** Whether the best versions are limited to the game systems and modules worlds use. */
    inUseOnly?: boolean;
    /** Limit them, or not. */
    onInUseOnlyChange?: (on: boolean) => void;
  }

  let { updates, disabled, inUseOnly = false, onInUseOnlyChange }: Props = $props();

  const uid = $props.id();
  /** Whether the best versions are being worked out. */
  let working = $state(false);
  /**
   * What the last planning came to, when the plan panel would not show it: nothing to change, or no plan at all. Kept
   * with the plan's count of changes then, so it goes once the plan changes again.
   */
  let outcome = $state<{ readonly text: string; readonly at: number } | null>(null);

  /** Replace the plan with the best versions. */
  async function planBest(): Promise<void> {
    working = true;
    outcome = null;
    const limited = inUseOnly;
    try {
      const replaced = await updates.planBest({ inUseOnly: limited });
      let key: string | undefined;
      if (!replaced) key = 'Best.Failed';
      else if (updates.choices.length === 0) key = limited ? 'Best.AlreadyBestInUse' : 'Best.AlreadyBest';
      if (key !== undefined) outcome = { text: localize(key), at: updates.changes };
    } finally {
      working = false;
    }
  }
</script>

<section class="emma-best" aria-labelledby="{uid}-heading">
  <h3 id="{uid}-heading">{localize('Best.Heading')}</h3>
  <p>{localize('Best.Hint')}</p>
  <button
    type="button"
    disabled={disabled || working || updates.status !== 'found'}
    onclick={() => {
      void planBest();
    }}>
    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
    {localize(updates.choices.length > 0 ? 'Best.Replace' : 'Best.Plan')}
  </button>
  <label class="emma-best-in-use">
    <input
      type="checkbox"
      checked={inUseOnly}
      disabled={disabled || working}
      onchange={event => {
        onInUseOnlyChange?.(event.currentTarget.checked);
      }} />
    {localize('Best.InUseOnly')}
  </label>
  <p class="emma-best-hint">{localize('Best.InUseOnlyHint')}</p>
  {#if working}
    <p role="status">{localize('Best.Working')}</p>
  {:else if outcome !== null && outcome.at === updates.changes}
    <p role="status">{outcome.text}</p>
  {/if}
</section>

<style>
  .emma-best {
    margin-top: 1rem;
  }

  .emma-best button {
    width: auto;
  }

  .emma-best-in-use {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .emma-best-in-use input {
    margin: 0;
  }

  .emma-best-hint {
    margin-top: 0.25rem;
    font-size: 0.85em;
    opacity: 0.85;
  }
</style>
