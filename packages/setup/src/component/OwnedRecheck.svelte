<!--
  Beside a refusal for want of premium content the user does not own: a button to have EMMA ask Foundry again what they
  own, as after buying it, rather than wait for its weekly check. Shown only where Foundry can be asked.
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';

  import { localize } from '../lib/i18n';
  import BusyMark from './BusyMark.svelte';

  interface Props {
    updates: UpdateState;
    /** Ask Foundry again what the user owns. */
    recheck: () => Promise<void>;
    /** Once asked again: the refusal is past, and the choice can be made again. */
    onDone?: (() => void) | undefined;
  }

  let { updates, recheck, onDone }: Props = $props();

  /** What EMMA is doing in asking Foundry again, while it does. */
  const asking = $derived(updates.busy.activityOf('owned'));

  /** Ask Foundry again what the user owns, then say so. */
  async function ask(): Promise<void> {
    await updates.busy.run('owned', 'checking', recheck);
    onDone?.();
  }
</script>

<p class="emma-busy-host emma-owned-recheck">
  <button
    type="button"
    disabled={updates.locked || asking !== undefined}
    onclick={() => {
      void ask();
    }}>
    <i class="fa-solid fa-rotate" aria-hidden="true"></i>
    {localize('Premium.Recheck')}
  </button>
  <BusyMark activity={asking} />
</p>

<style>
  .emma-owned-recheck button {
    width: auto;
  }
</style>
