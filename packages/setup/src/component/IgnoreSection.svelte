<!--
  Ignoring a world, game system or module, among the actions at the top of its panel: ignored, no plan takes it into account, as the EMMA
  module's hypothetical mode ignores a module (see `considered`). It takes effect at once, not in the plan.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import { format, localize } from '../lib/i18n';

  import ActionItem from './ActionItem.svelte';
  import BusyMark from './BusyMark.svelte';
  import NoteField from './NoteField.svelte';

  interface Props {
    /** Its title. */
    title: string;
    /** Whether it is a world, rather than a game system or module. */
    world?: boolean;
    /** Whether it is ignored. */
    ignored: boolean;
    /** Whether it cannot be ignored or stop being ignored now, as while the plan runs. */
    disabled: boolean;
    /** Ignore it, or stop ignoring it. */
    onIgnore: (ignore: boolean) => void;
    /** What EMMA is busy with because of this section's button, shown over it; nothing by default. */
    busy?: Activity | undefined;
    /** The user's note on it, while it is held, if notes can be kept: the note, and how to keep it. */
    note?: { readonly text: string | undefined; readonly onSave: (text: string) => void } | undefined;
  }

  let { title, world = false, ignored, disabled, onIgnore, busy, note }: Props = $props();
  const said = $derived(
    ignored ? (world ? 'Ignore.IgnoredWorld' : 'Ignore.Ignored') : world ? 'Ignore.UnignoredWorld' : 'Ignore.Unignored',
  );
</script>

{#snippet button()}
  <button
    type="button"
    class="emma-busy-host"
    aria-busy={busy !== undefined}
    disabled={disabled || busy !== undefined}
    onclick={() => {
      onIgnore(!ignored);
    }}>
    <i class={['fa-solid', ignored ? 'fa-eye' : 'fa-eye-slash']} aria-hidden="true"></i>
    {format(ignored ? 'Ignore.Unignore' : 'Ignore.Ignore', { title })}
    <BusyMark activity={busy} />
  </button>
{/snippet}

{#snippet noted()}
  {#if note !== undefined && ignored}
    <NoteField note={note.text} label={format('Note.Ignore', { title })} {disabled} onSave={note.onSave} />
  {/if}
{/snippet}

{#snippet about()}
  <p>{format(said, { title })}</p>
{/snippet}

<ActionItem label={localize('Ignore.Heading')} {button} {about} note={noted} />
