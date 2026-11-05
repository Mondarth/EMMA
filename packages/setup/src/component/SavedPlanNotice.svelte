<!--
  A plan a run did not finish, kept from an earlier visit, as when a step failed or the page closed while it ran: offered
  to resume, or to discard (see `SetupState.savedPlan`).
-->
<script lang="ts">
  import { format, localize } from '../lib/i18n';

  interface Props {
    /** How many changes it has still to make. */
    count: number;
    /** Resume it. */
    onResume: () => void;
    /** Discard it. */
    onDiscard: () => void;
  }

  let { count, onResume, onDiscard }: Props = $props();
</script>

<div class="emma-saved-plan" role="region" aria-label={localize('Saved.Label')}>
  <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
  <p>{format('Saved.Offer', { count: String(count) })}</p>
  <button type="button" onclick={onResume}>
    <i class="fa-solid fa-play" aria-hidden="true"></i>
    {localize('Saved.Resume')}
  </button>
  <button type="button" onclick={onDiscard}>
    <i class="fa-solid fa-trash" aria-hidden="true"></i>
    {localize('Saved.Discard')}
  </button>
</div>

<style>
  .emma-saved-plan {
    display: flex;
    flex-basis: 100%;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--color-border-highlight, #ff6400);
    border-radius: 4px;
  }

  .emma-saved-plan p {
    flex: 1;
    margin: 0;
  }

  .emma-saved-plan button {
    flex: none;
    width: auto;
  }
</style>
