<!--
  The user's note on what they ignore, lock or pin, under its button in the panel's actions: a line, kept as it is left,
  or on Enter; Escape puts back what was kept. Emptied, it is no note.
-->
<script lang="ts">
  import { MAX_NOTE_LENGTH } from '../app/notes.svelte';
  import { localize } from '../lib/i18n';

  interface Props {
    /** The note kept, if any. */
    note: string | undefined;
    /** What the note is on, for the field's label, such as "Note on ignoring D&D 5e". */
    label: string;
    /** Whether it cannot be changed now, as while the plan runs. */
    disabled?: boolean;
    /** Keep the note, or none for empty text. */
    onSave: (text: string) => void;
  }

  let { note, label, disabled = false, onSave }: Props = $props();
</script>

<input
  class="emma-note-field"
  type="text"
  aria-label={label}
  maxlength={MAX_NOTE_LENGTH}
  placeholder={localize('Note.Placeholder')}
  value={note ?? ''}
  {disabled}
  onchange={event => {
    onSave(event.currentTarget.value);
  }}
  onkeydown={event => {
    if (event.key === 'Enter') event.currentTarget.blur();
    else if (event.key === 'Escape') {
      // Put back what was kept, and leave, so that leaving keeps nothing new; the window stays open.
      event.stopPropagation();
      event.currentTarget.value = note ?? '';
      event.currentTarget.blur();
    }
  }} />

<style>
  .emma-note-field {
    width: 100%;
    margin-top: 0.25rem;
    font-size: 0.9em;
  }
</style>
