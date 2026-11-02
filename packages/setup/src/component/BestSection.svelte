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
  }

  let { updates, disabled }: Props = $props();

  const uid = $props.id();
  /** Whether the best versions are being worked out. */
  let working = $state(false);

  /** Replace the plan with the best versions. */
  async function planBest(): Promise<void> {
    working = true;
    try {
      await updates.planBest();
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
  {#if working}
    <p role="status">{localize('Best.Working')}</p>
  {/if}
</section>

<style>
  .emma-best {
    margin-top: 1rem;
  }

  .emma-best button {
    width: auto;
  }
</style>
