<script lang="ts">
  import { format, formatList, localize } from '@module/lib/i18n';
  import { log } from '@module/lib/logger';
  import type { ModuleState } from '@module/state/module-state.svelte';

  interface Props {
    /** The modules and the changes staged to them. */
    modules: ModuleState;
    /** Whether the user may save changes. */
    canManage: boolean;
    /** Saves the staged changes. */
    onSave: () => Promise<unknown>;
  }

  const { modules, canManage, onSave }: Props = $props();

  let saving = $state(false);

  const changeCount = $derived(Object.keys(modules.changes).length);
  const canSave = $derived(canManage && modules.dirty && modules.unmet.length === 0 && !saving);

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
  </div>

  {#if canManage}
    <div class="emma-footer-actions">
      <button
        type="button"
        disabled={!modules.dirty || saving}
        onclick={() => {
          modules.reset();
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
