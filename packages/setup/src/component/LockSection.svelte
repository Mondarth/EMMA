<!--
  Locking a game system or module in Foundry, among the actions at the top of its panel, as Foundry's own package menu
  does: a locked package is
  kept as it is installed, as Foundry refuses to update or uninstall it, so EMMA's plan never changes it either. Or
  locking Foundry VTT itself, in EMMA alone, as Foundry has no lock for itself, so that the plan keeps its build but
  updates what runs on it. It takes effect at once, not in the plan.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import { format, localize } from '../lib/i18n';

  import ActionItem from './ActionItem.svelte';
  import BusyMark from './BusyMark.svelte';
  import NoteField from './NoteField.svelte';

  interface Props {
    /** The package's title. */
    title: string;
    /** Its installed version. */
    version: string;
    /** Whether it is locked. */
    locked: boolean;
    /** Whether it cannot be locked or unlocked now, as while the plan runs. */
    disabled: boolean;
    /** Lock it, or unlock it. */
    onLock: (lock: boolean) => void;
    /** Whether it is Foundry VTT, locked in EMMA, rather than a package locked in Foundry. */
    core?: boolean;
    /** What EMMA is busy with because of this section's button, shown over it; nothing by default. */
    busy?: Activity | undefined;
    /** The user's note on it, while it is held, if notes can be kept: the note, and how to keep it. */
    note?: { readonly text: string | undefined; readonly onSave: (text: string) => void } | undefined;
  }

  let { title, version, locked, disabled, onLock, core = false, busy, note }: Props = $props();
  const said = $derived(
    core ? (locked ? 'Lock.CoreLocked' : 'Lock.CoreUnlocked') : locked ? 'Lock.Locked' : 'Lock.Unlocked',
  );
</script>

{#snippet button()}
  <button
    type="button"
    class="emma-busy-host"
    aria-busy={busy !== undefined}
    disabled={disabled || busy !== undefined}
    onclick={() => {
      onLock(!locked);
    }}>
    <i class={['fa-solid', locked ? 'fa-unlock' : 'fa-lock']} aria-hidden="true"></i>
    {format(locked ? 'Lock.Unlock' : 'Lock.Lock', { title, version })}
    <BusyMark activity={busy} />
  </button>
{/snippet}

{#snippet noted()}
  {#if note !== undefined && locked}
    <NoteField note={note.text} label={format('Note.Lock', { title })} {disabled} onSave={note.onSave} />
  {/if}
{/snippet}

{#snippet about()}
  <p>{format(said, { title, version })}</p>
{/snippet}

<ActionItem label={localize('Lock.Heading')} {button} {about} note={noted} />
