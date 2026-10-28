<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import { log } from '@module/lib/logger';
  import type { DrawerField, DrawerFieldsDraft } from '@module/state/drawer-fields.svelte';
  import { DRAWER_FIELDS } from '@module/state/drawer-fields.svelte';

  interface Props {
    /** The details being chosen. */
    draft: DrawerFieldsDraft;
    /** Saves the details chosen, in drawer order, reporting its own problems to the user. */
    onSave: (fields: DrawerField[]) => Promise<unknown>;
  }

  const { draft, onSave }: Props = $props();

  const uid = $props.id();

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
      await onSave(draft.fields);
    } catch (error) {
      log.error('Unable to save the drawer fields', error);
    } finally {
      saving = false;
    }
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
          checked={draft.has(field)}
          onchange={(event: Event & { currentTarget: HTMLInputElement }) => {
            draft.choose(field, event.currentTarget.checked);
          }} />
        {localize(`MONDARTH-EMMA.Drawer.Field.${field}`)}
      </label>
    {/each}
  </fieldset>

  <footer class="form-footer">
    <button
      type="button"
      onclick={() => {
        draft.chooseDefaults();
      }}>
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
