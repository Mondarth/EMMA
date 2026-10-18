<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { localize } from '@module/lib/i18n';
  import { log } from '@module/lib/logger';
  import type { DrawerField } from '@module/state/drawer-fields.svelte';
  import { DEFAULT_DRAWER_FIELDS, DRAWER_FIELDS } from '@module/state/drawer-fields.svelte';

  interface Props {
    /** The details shown now. */
    initial: readonly DrawerField[];
    /** Saves the details chosen, in drawer order, reporting its own problems to the user. */
    onSave: (fields: DrawerField[]) => Promise<unknown>;
  }

  const { initial, onSave }: Props = $props();

  const uid = $props.id();

  // The form is mounted afresh each time its window opens, so the initial choice is only read once.
  // svelte-ignore state_referenced_locally
  const chosen = new SvelteSet<DrawerField>(initial);

  let saving = $state(false);

  /**
   * Save the details chosen, keeping Save disabled until saving finishes. Anything `onSave` throws is logged rather
   * than left unhandled.
   * @param event - The form's submission
   */
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    saving = true;
    try {
      await onSave(DRAWER_FIELDS.filter(field => chosen.has(field)));
    } catch (error) {
      log.error('Unable to save the drawer fields', error);
    } finally {
      saving = false;
    }
  }

  /**
   * Choose the details shown until a user chooses otherwise. Nothing is saved until the form is.
   */
  function reset(): void {
    chosen.clear();
    for (const field of DEFAULT_DRAWER_FIELDS) chosen.add(field);
  }
</script>

<form class="emma-fields" onsubmit={submit}>
  <fieldset>
    <legend>{localize('MONDARTH-EMMA.Settings.Fields.Legend')}</legend>
    {#each DRAWER_FIELDS as field (field)}
      <label for={`${uid}-${field}`}>
        <input
          id={`${uid}-${field}`}
          type="checkbox"
          checked={chosen.has(field)}
          onchange={(event: Event & { currentTarget: HTMLInputElement }) => {
            if (event.currentTarget.checked) chosen.add(field);
            else chosen.delete(field);
          }} />
        {localize(`MONDARTH-EMMA.Drawer.Field.${field}`)}
      </label>
    {/each}
  </fieldset>

  <footer class="form-footer">
    <button type="button" onclick={reset}>
      <i class="fa-solid fa-arrow-rotate-left" inert></i>
      {localize('MONDARTH-EMMA.Settings.Fields.Defaults')}
    </button>
    <button type="submit" disabled={saving}>
      <i class="fa-solid fa-floppy-disk" inert></i>
      {localize('MONDARTH-EMMA.Settings.Fields.Save')}
    </button>
  </footer>
</form>

<style>
  .emma-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: var(--font-body);
  }

  fieldset {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem 1rem;
    margin: 0;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>
