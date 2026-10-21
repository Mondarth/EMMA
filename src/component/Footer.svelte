<script lang="ts">
  import { format, formatList, localize } from '@module/lib/i18n';
  import { MODULE_ID } from '@module/lib/constants';
  import { log } from '@module/lib/logger';
  import type { ModuleState } from '@module/state/module-state.svelte';

  interface Props {
    /** The modules and the changes staged to them. */
    modules: ModuleState;
    /** Whether the user may save changes. */
    canManage: boolean;
    /** Saves the staged changes. */
    onSave: () => Promise<unknown>;
    /** Whether hypothetical mode is looking up versions without a proxy, so finds fewer. */
    unproxied?: boolean;
    /**
     * Hypothetical mode, while it is on: nothing can be saved, and Reset restores what was staged when it was entered,
     * through `reset`, enabled while `canReset`.
     */
    hypothetical?: { readonly canReset: boolean; readonly reset: () => void } | undefined;
  }

  const { modules, canManage, onSave, unproxied = false, hypothetical }: Props = $props();

  let saving = $state(false);

  const changeCount = $derived(Object.keys(modules.changes).length);
  // Saving would switch EMMA itself off, so the Settings sidebar would open Foundry's own window instead.
  const disablesEmma = $derived(modules.changes[MODULE_ID] === false);
  const canSave = $derived(
    canManage && hypothetical === undefined && modules.dirty && modules.unmet.length === 0 && !saving,
  );
  const canReset = $derived((hypothetical === undefined ? modules.dirty : hypothetical.canReset) && !saving);

  /**
   * Save the staged changes, keeping the buttons disabled until saving finishes. `onSave` reports its own problems to
   * the user; anything it throws regardless is logged rather than left unhandled.
   */
  async function save(): Promise<void> {
    saving = true;
    try {
      await onSave();
    } catch (error) {
      log.error('Unable to save', error);
    } finally {
      saving = false;
    }
  }
</script>

<footer class="emma-footer">
  <div class="emma-footer-status" role="status">
    {#if !canManage}
      <p class="emma-read-only">
        <i class="fa-solid fa-lock" inert></i>
        {localize('MONDARTH-EMMA.Footer.ReadOnly')}
      </p>
    {:else if modules.unmet.length > 0}
      <ul class="emma-unmet">
        {#each modules.unmet as { entry, missing } (entry.id)}
          <li>
            <i class="fa-solid fa-triangle-exclamation" inert></i>
            {format('MONDARTH-EMMA.Requirements.Unmet', { module: entry.title, missing: formatList(missing) })}
          </li>
        {/each}
      </ul>
    {:else if modules.dirty}
      <p>{format('MONDARTH-EMMA.Footer.Changes', { count: String(changeCount) })}</p>
    {/if}
    {#if unproxied}
      <p class="emma-unproxied">
        <i class="fa-solid fa-circle-info" inert></i>
        {localize('MONDARTH-EMMA.Footer.NoProxy')}
      </p>
    {/if}
    {#if canManage && disablesEmma}
      <p class="emma-disables">
        <i class="fa-solid fa-triangle-exclamation" inert></i>
        {localize('MONDARTH-EMMA.Footer.DisablesEmma')}
      </p>
    {/if}
  </div>

  {#if canManage}
    <div class="emma-footer-actions">
      <button
        type="button"
        disabled={!canReset}
        onclick={() => {
          if (hypothetical === undefined) modules.reset();
          else hypothetical.reset();
        }}>
        <i class="fa-solid fa-arrow-rotate-left" inert></i>
        {localize('MONDARTH-EMMA.Footer.Reset')}
      </button>
      <button type="button" disabled={!canSave} onclick={save}>
        <i class="fa-solid fa-floppy-disk" inert></i>
        {localize('MONDARTH-EMMA.Footer.Save')}
      </button>
    </div>
  {/if}
</footer>

<style>
  .emma-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .emma-footer-status {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-12);
    color: var(--color-text-secondary);
  }

  .emma-footer-status p,
  .emma-unmet {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .emma-footer-actions {
    display: flex;
    flex: none;
    gap: 0.5rem;
  }
</style>
