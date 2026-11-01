<!--
  The update plan, below the tree and the panel beside it while versions are chosen. First what to keep before anything
  changes: a snapshot of the installation, and a backup of each world that uses a package the plan changes, each with a
  box to check and the note Foundry keeps with it, and the space a snapshot needs and the space free. Then each package
  whose chosen version differs from the one installed, with both, in the order they are to be installed, and the
  manifest URL that installs the version chosen.
-->
<script lang="ts">
  import type { SnapshotSpaceState } from '../app/setup-state.svelte';
  import type { UpdateState } from '../app/update-state.svelte';
  import { format, formatSize, localize } from '../lib/i18n';
  import type { Overview } from '../lib/overview';
  import type { Safeguard } from '../lib/safeguards';

  interface Props {
    overview: Overview;
    updates: UpdateState;
    /** The space a snapshot needs and the space free, as far as it is known. */
    space?: SnapshotSpaceState;
  }

  let { overview, updates, space = null }: Props = $props();

  /**
   * A safeguard's name.
   * @param guard - The snapshot or backup
   * @returns Its name
   */
  function nameOf(guard: Safeguard): string {
    return guard.world === undefined ? localize('Plan.Snapshot') : format('Plan.Backup', { world: guard.world.title });
  }

  /**
   * What is known of the space a safeguard needs: a snapshot's size and the space free; only the space free for a
   * backup, as Foundry does not say what one needs.
   * @param guard - The snapshot or backup
   * @returns The space, in words, and whether there is too little
   */
  function spaceOf(guard: Safeguard): { text: string; short: boolean } {
    if (space === 'checking') return { text: localize('Plan.Checking'), short: false };
    if (space === null || space === 'failed') {
      return {
        text: localize(guard.kind === 'snapshot' ? 'Plan.SpaceUnknown' : 'Plan.BackupSizeUnknown'),
        short: false,
      };
    }
    const sizes = { required: formatSize(space.required), available: formatSize(space.available) };
    if (guard.kind === 'backup') return { text: format('Plan.BackupSpace', sizes), short: false };
    const short = space.required > space.available;
    return { text: format(short ? 'Plan.NotEnough' : 'Plan.SnapshotSpace', sizes), short };
  }

  const uid = $props.id();

  /** The installed packages' titles, by package key. */
  const titles = $derived(
    new Map<string, string>([
      ['core', localize('Tree.Root')],
      ...overview.systems.map(({ id, title }) => [`system:${id}`, title] as const),
      ...overview.modules.map(({ module: { id, title } }) => [`module:${id}`, title] as const),
    ]),
  );
</script>

<section class="emma-update-plan" aria-labelledby="{uid}-heading">
  <header>
    <h3 id="{uid}-heading">{localize('Update.Plan')}</h3>
    <button
      type="button"
      onclick={() => {
        updates.clear();
      }}>
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      {localize('Update.Clear')}
    </button>
  </header>
  {#if updates.safeguards.length > 0}
    <table aria-label={localize('Plan.Safeguards')}>
      <thead>
        <tr>
          <th scope="col">{localize('Plan.Keep')}</th>
          <th scope="col">{localize('Plan.Note')}</th>
          <th scope="col">{localize('Plan.Space')}</th>
        </tr>
      </thead>
      <tbody>
        {#each updates.safeguards as guard (guard.key)}
          {@const room = spaceOf(guard)}
          <tr>
            <th scope="row">
              <label>
                <input
                  type="checkbox"
                  checked={guard.checked}
                  onchange={event => {
                    updates.setSafeguard(guard.key, { checked: event.currentTarget.checked });
                  }} />
                {nameOf(guard)}
              </label>
              {#if guard.recommended}
                <span class="emma-plan-needed">{localize('Plan.Recommended')}</span>
              {:else if guard.packages !== undefined}
                <span class="emma-plan-needed"
                  >{format('Plan.BackupUses', { packages: guard.packages.join(', ') })}</span>
              {/if}
            </th>
            <td>
              <input
                type="text"
                class="emma-plan-note-input"
                aria-label={format('Plan.NoteOf', { name: nameOf(guard) })}
                value={guard.note}
                oninput={event => {
                  updates.setSafeguard(guard.key, { note: event.currentTarget.value });
                }} />
            </td>
            <td class={['emma-plan-space', room.short && 'emma-plan-missing']}>{room.text}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <table aria-label={localize('Plan.Changes')}>
    <thead>
      <tr>
        <th scope="col">{localize('Update.Package')}</th>
        <th scope="col">{localize('Update.Installed')}</th>
        <th scope="col">{localize('Update.Chosen')}</th>
        <th scope="col">{localize('Update.Manifest')}</th>
      </tr>
    </thead>
    <tbody>
      {#each updates.choices as choice (choice.key)}
        <tr>
          <th scope="row">{titles.get(choice.key) ?? choice.key}</th>
          <td>{choice.installed}</td>
          <td>
            {choice.chosen}
            {#if choice.by !== undefined}
              <span class="emma-plan-needed">{format('Update.NeededBy', choice.by)}</span>
            {/if}
          </td>
          <td class="emma-plan-manifest">
            {#if choice.manifest !== undefined}
              <a href={choice.manifest} target="_blank" rel="noopener noreferrer">{choice.manifest}</a>
            {:else if choice.key === 'core'}
              <span class="emma-plan-note">{localize('Update.CoreManifest')}</span>
            {:else}
              <span class="emma-plan-missing">{localize('Update.NoManifest')}</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  .emma-plan-needed {
    font-size: 0.85em;
    opacity: 0.8;
    font-style: italic;
  }

  .emma-plan-note-input {
    width: 100%;
  }

  .emma-plan-space {
    font-family: var(--font-primary, sans-serif);
    font-size: 0.85em;
  }

  .emma-plan-manifest {
    font-size: 0.85em;
    overflow-wrap: anywhere;
  }

  .emma-plan-note,
  .emma-plan-missing {
    font-family: var(--font-primary, sans-serif);
    font-style: italic;
  }

  .emma-plan-missing {
    color: var(--color-level-error, #c00);
  }

  .emma-update-plan {
    overflow: auto;
    padding: 0 0.5rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  header button {
    flex: none;
    width: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    padding: 0.15rem 0.5rem;
  }

  tbody th {
    font-weight: normal;
  }

  td {
    font-family: var(--font-mono, monospace);
  }
</style>
