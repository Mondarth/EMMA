<!--
  Pinning a package, or Foundry VTT, among the actions at the top of its panel: its toggle, for the version the plan has
  of it, or else the one installed, saying what it does (see `PinToggle`). It is a choice in every plan, not a lock in
  Foundry.
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';

  import ActionItem from './ActionItem.svelte';
  import NoteField from './NoteField.svelte';
  import PinToggle from './PinToggle.svelte';

  interface Props {
    updates: UpdateState;
    /** The package's key, or `core`. */
    key: string;
    /** Its title. */
    title: string;
    /** The version to pin: the plan's, or else the installed one. */
    version: string;
    /** The user's note on it, while it is held, if notes can be kept: the note, and how to keep it. */
    note?: { readonly text: string | undefined; readonly onSave: (text: string) => void } | undefined;
  }

  let { updates, key, title, version, note }: Props = $props();
</script>

{#snippet button()}
  <PinToggle {updates} {key} {title} {version} labelled />
{/snippet}

{#snippet noted()}
  {#if note !== undefined && updates.pinnedOf(key) !== undefined}
    <NoteField note={note.text} label={format('Note.Pin', { title })} disabled={updates.locked} onSave={note.onSave} />
  {/if}
{/snippet}

{#snippet about()}
  <p>{localize('Pin.About')}</p>
{/snippet}

<ActionItem label={localize('Pin.Heading')} {button} {about} note={noted} />
