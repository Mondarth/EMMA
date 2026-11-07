<!--
  One of the actions at the top of a details panel, such as Lock, Ignore or Uninstall: its button, which names it, and
  beside it an information button that shows or hides what the action does, hidden at first. What must always be read,
  as why the action cannot be taken, shows below the button whatever the information button says. Its text is as wide
  as the buttons, wrapping, so that showing it does not widen the actions' row.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { format } from '../lib/i18n';

  interface Props {
    /** The action's name, for the group and its information button. */
    label: string;
    /** The action's button. */
    button: Snippet;
    /** What the action does, shown once asked for. */
    about: Snippet;
    /** What is shown below the button always, if anything. */
    shown?: Snippet | undefined;
    /** Whether what the action does includes a warning, so that the information button stands out. */
    warning?: boolean;
  }

  let { label, button, about, shown, warning = false }: Props = $props();
  let showing = $state(false);

  const uid = $props.id();
</script>

<div class="emma-action" role="group" aria-label={label}>
  <div class="emma-action-row">
    {@render button()}
    <button
      type="button"
      class={['emma-action-info', { 'emma-action-warning': warning }]}
      aria-expanded={showing}
      aria-controls="{uid}-about"
      aria-label={format('Action.About', { action: label })}
      data-tooltip={format('Action.About', { action: label })}
      onclick={() => {
        showing = !showing;
      }}>
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
    </button>
  </div>
  {#if shown !== undefined}
    <div class="emma-action-text">{@render shown()}</div>
  {/if}
  <div id="{uid}-about" class="emma-action-text" hidden={!showing}>{@render about()}</div>
</div>

<style>
  .emma-action {
    display: flex;
    flex-direction: column;
    flex: 0 1 auto;
    max-width: 100%;
  }

  .emma-action-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .emma-action-row :global(button:first-child) {
    width: auto;
  }

  .emma-action-info {
    flex: none;
    width: auto;
    min-width: 0;
    padding: 0 0.35rem;
    border: none;
    background: none;
    box-shadow: none;
    opacity: 0.8;
  }

  .emma-action-info[aria-expanded='true'],
  .emma-action-info:hover {
    opacity: 1;
  }

  .emma-action-warning {
    color: var(--color-level-warning, #ec3);
    opacity: 1;
  }

  /* As wide as the buttons, so that it wraps rather than widening the row the actions are in. */
  .emma-action-text {
    width: 0;
    min-width: 100%;
    font-size: 0.9em;
  }

  .emma-action-text[hidden] {
    display: none;
  }
</style>
