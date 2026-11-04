<!--
  The warning, in the footer, that this version of EMMA is in alpha testing: to be used at one's own risk, on a test
  installation, with a link to the page about the alpha. Until the user acknowledges it, for this version, it asks them
  to, as the plan cannot be run before (see `SetupState.acknowledgeAlpha`).
-->
<script lang="ts">
  import { ALPHA_PAGE } from '../lib/alpha';
  import { format, localize } from '../lib/i18n';

  interface Props {
    /** The version of EMMA. */
    version: string;
    /** Whether the user has acknowledged it is an alpha. */
    acknowledged: boolean;
    /** Acknowledge it. */
    onAcknowledge: () => void;
  }

  let { version, acknowledged, onAcknowledge }: Props = $props();
</script>

<div class="emma-alpha" role="note" aria-label={localize('Alpha.Label')}>
  <i class="fa-solid fa-triangle-exclamation emma-alpha-icon" aria-hidden="true"></i>
  <p>
    <strong>{format('Alpha.Heading', { version })}</strong>
    {localize('Alpha.Warning')}
    <a href={ALPHA_PAGE} target="_blank" rel="noopener noreferrer">
      {localize('Alpha.Details')}<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
  </p>
  {#if !acknowledged}
    <button type="button" onclick={onAcknowledge}>
      <i class="fa-solid fa-check" aria-hidden="true"></i>
      {localize('Alpha.Acknowledge')}
    </button>
  {/if}
</div>

<style>
  /* Fixed colours, not the theme's, so that it stands out on any theme, light or dark. */
  .emma-alpha {
    display: flex;
    flex-basis: 100%;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 2px solid #a06c00;
    border-radius: 4px;
    background: #fff3cd;
    color: #3d2c00;
  }

  .emma-alpha p {
    flex: 1;
    margin: 0;
  }

  .emma-alpha a {
    color: #7a3e00;
    font-weight: bold;
    text-decoration: underline;
  }

  .emma-alpha a i {
    margin-left: 0.25em;
    font-size: 0.8em;
  }

  .emma-alpha-icon {
    font-size: 1.6em;
    color: #a06c00;
  }

  .emma-alpha button {
    flex: none;
    width: auto;
  }
</style>
