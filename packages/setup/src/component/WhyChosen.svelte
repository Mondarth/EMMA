<!--
  Why the plan takes the version of a package it does, rather than a newer one, in the panel for the package: each newer
  version, newest first, and why the plan does not take it (see `UpdateState.notTakenOf`). Worked out when the panel
  shows it, and again when the plan changes; nothing for a package the plan does not change or takes at its newest.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import type { NotTakenRun, UpdateState } from '../app/update-state.svelte';
  import { versionIn } from '../app/update-state.svelte';
  import { format, localize } from '../lib/i18n';
  import BusyMark from './BusyMark.svelte';

  interface Props {
    updates: UpdateState;
    /** The package's key. */
    key: string;
  }

  let { updates, key }: Props = $props();

  const uid = $props.id();
  /** The version the plan takes. */
  const chosen = $derived(updates.plan.find(entry => entry.key === key)?.version);
  /** The newer versions not taken, once worked out. */
  let runs = $state.raw<readonly NotTakenRun[] | null>(null);
  /** Counts the times they are asked for, so that only the latest answer is kept. */
  let asked = 0;
  /** The package and the plan they were last asked for, so that they are not asked for again for the same. */
  let askedFor = '';

  $effect(() => {
    // Asked again whenever the plan changes, or the package shown does.
    const shown = key;
    const signature = [shown, ...updates.plan.map(({ key: planned, version }) => `${planned}@${version}`)].join(' ');
    if (signature === askedFor) return;
    askedFor = signature;
    // Untracked: working it out reads and writes what EMMA is busy with, and the state it reads, which would ask again.
    untrack(() => {
      const asking = ++asked;
      runs = null;
      void updates.busy
        .run(`why:${shown}`, 'checking', () => updates.notTakenOf(shown))
        .then(found => {
          if (asking === asked) runs = found;
        });
    });
  });

  /**
   * The versions a line is for.
   * @param run - The line's versions
   * @returns The version, or the newest and oldest
   */
  const versionsOf = (run: NotTakenRun): string =>
    run.newest === run.oldest ? run.newest : `${run.newest} – ${run.oldest}`;

  /**
   * The resolver's explanation of a line's versions: the newest's, naming every version of the line where it names the
   * newest, as the others' explanations say the same of themselves.
   * @param run - The line's versions
   * @param lines - The newest's explanation
   * @returns The explanation
   */
  const explained = (run: NotTakenRun, lines: readonly string[]): string[] =>
    run.newest === run.oldest ? [...lines] : lines.map(line => line.replace(versionIn(run.newest), versionsOf(run)));

  /**
   * Why the plan does not take a line's versions, in words.
   * @param run - The line's versions
   * @returns The words
   */
  function reasonOf(run: NotTakenRun): string {
    const versions = versionsOf(run);
    const { why } = run;
    switch (why.reason) {
      case 'no-build':
        return why.minimum === undefined
          ? format('Why.NoBuild', { versions })
          : format('Why.NeedsBuild', { versions, minimum: why.minimum });
      case 'no-manifest':
        return format('Why.NoManifest', { versions });
      case 'conflict':
        return format('Why.Conflict', { versions });
      default:
        return format('Why.Possible', { versions });
    }
  }
</script>

{#if chosen !== undefined && (runs === null || runs.length > 0)}
  <section class="emma-why emma-busy-host" aria-labelledby="{uid}-heading" aria-busy={runs === null}>
    <h3 id="{uid}-heading">
      {#if runs === null || runs[0] === undefined}
        {format('Why.Checking', { chosen })}
      {:else}
        {format('Why.Heading', { chosen, newest: runs[0].newest })}
      {/if}
    </h3>
    {#if runs !== null}
      <p>{localize('Why.Hint')}</p>
      <ul class="emma-why-list">
        {#each runs as run (run.newest)}
          <li>
            {reasonOf(run)}
            {#if run.why.reason === 'conflict' && run.why.explanation.length > 0}
              <ol class="emma-why-explained">
                {#each explained(run, run.why.explanation) as line, index (index)}
                  <li>{line}</li>
                {/each}
              </ol>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <BusyMark activity={updates.busy.activityOf(`why:${key}`)} />
    {/if}
  </section>
{/if}

<style>
  .emma-why {
    margin-top: 1rem;
    min-height: 2.5rem;
  }

  .emma-why-list {
    padding-left: 1.2rem;
  }

  .emma-why-explained {
    padding-left: 1.2rem;
    list-style: none;
  }
</style>
