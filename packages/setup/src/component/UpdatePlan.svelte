<!--
  The update plan, below the tree and the panel beside it while versions are chosen. First what to keep before anything
  changes: a snapshot of the installation, and a backup of each world that uses a package the plan changes, each with a
  box to check and the note Foundry keeps with it, and the space a snapshot needs and the space free. Then each package
  whose chosen version differs from the one installed, with both, in the order they are to be installed, and the
  manifest URL that installs the version chosen, then each package to uninstall. **Run plan** asks to confirm, listing the steps, then runs them, each
  row saying how far its step has got.
-->
<script lang="ts">
  import type { PlanRun, SnapshotSpaceState } from '../app/setup-state.svelte';
  import type { NewerCore, UpdateState } from '../app/update-state.svelte';
  import { format, formatSize, localize } from '../lib/i18n';
  import type { Overview } from '../lib/overview';
  import { UNINSTALL } from '../lib/plans';
  import { runSteps, stepText } from '../lib/run';
  import type { Safeguard } from '../lib/safeguards';
  import type { TreeSelection } from '../lib/tree';
  import BusyMark from './BusyMark.svelte';
  import PinToggle from './PinToggle.svelte';
  import TreeLink from './TreeLink.svelte';

  interface Props {
    overview: Overview;
    updates: UpdateState;
    /** The space a snapshot needs and the space free, as far as it is known. */
    space?: SnapshotSpaceState;
    /** Why Foundry VTT cannot be updated in place to the build chosen, if it cannot: its row is marked, saying why. */
    coreBlocked?: string | undefined;
    /** The last run of the plan, if any. */
    run?: PlanRun | null;
    /** Run the plan, once the user confirms it; the plan cannot be run without. */
    onRun?: (() => void) | undefined;
    /** Whether the user has acknowledged that EMMA is in alpha testing, which running the plan needs. */
    acknowledged?: boolean;
    /** Acknowledge it, from the confirmation. */
    onAcknowledge?: (() => void) | undefined;
    /** Open the tree to a package's row, and select it, as its name in the plan is clicked. */
    onOpen?: ((link: TreeSelection) => void) | undefined;
    /** The user's note on a package's pin, shown beside the pin; none without. */
    pinNoteOf?: ((key: string) => string | undefined) | undefined;
  }

  let {
    overview,
    updates,
    space = null,
    coreBlocked,
    run = null,
    onRun,
    acknowledged = true,
    onAcknowledge,
    onOpen,
    pinNoteOf,
  }: Props = $props();

  /**
   * The tree's row for a change's package.
   * @param key - The package's key
   * @returns The row's selection
   */
  function linkOf(key: string): TreeSelection {
    if (key === 'core') return { kind: 'root' };
    const id = key.slice(key.indexOf(':') + 1);
    return key.startsWith('system:') ? { kind: 'system', system: id } : { kind: 'module', module: id };
  }

  /** The newest build of Foundry VTT's generation, when the plan has an older one, and whether the plan can take it. */
  let newerCore = $state.raw<NewerCore | undefined>(undefined);
  $effect(() => {
    const { plan } = updates;
    void updates.newerCore().then(newer => {
      // An answer for a plan since changed is dropped.
      if (plan === updates.plan) newerCore = newer;
    });
  });

  /** Whether the user is asked to confirm a run. */
  let confirming = $state(false);
  const running = $derived(run !== null && !run.over);
  /** The steps a run would take now. */
  const steps = $derived(runSteps(updates.safeguards, updates.plan, key => updates.titleOf(key)));

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

{#snippet stateOf(key: string)}
  {@const state = run?.states[key]}
  {@const reached = run?.progress?.[key]}
  {#if state === 'running' && reached !== undefined}
    <!-- Foundry says how far an install has got: the percentage takes the spinner's place. -->
    <span class="emma-plan-state emma-plan-state-running">
      {format(reached.phase === 'download' ? 'Run.Downloading' : 'Run.Installing', { pct: String(reached.pct) })}
    </span>
  {:else if state !== undefined}
    <span class={['emma-plan-state', `emma-plan-state-${state}`]}>
      <i
        class={[
          'fa-solid',
          {
            waiting: 'fa-hourglass',
            running: 'fa-spinner fa-spin',
            done: 'fa-check',
            failed: 'fa-xmark',
            skipped: 'fa-ban',
          }[state],
        ]}
        aria-hidden="true"></i>
      {localize(`Run.State.${state}`)}
    </span>
    {#if state === 'failed' && onOpen !== undefined}
      <span class="emma-plan-needed">{localize('Run.SeeWhy')}</span>
    {/if}
    {@const stopped = run?.needed?.[key]}
    {#if state === 'skipped' && stopped !== undefined}
      <span class="emma-plan-needed">{format('Run.Needs', { steps: stopped.map(stepText).join(', ') })}</span>
    {/if}
  {/if}
{/snippet}

<!--
  The bar along the foot of a step's title cell: blue as it downloads, then green over it as it installs, to the
  percentage Foundry gives; full and green once it is done, as an underline; red where it stopped if it failed. A step
  Foundry says nothing of the progress of has the underline alone, once done or failed.
-->
{#snippet barOf(key: string)}
  {@const state = run?.states[key]}
  {@const reached = run?.progress?.[key]}
  {@const measured = state === 'running' && reached !== undefined}
  {#if measured || state === 'done' || state === 'failed'}
    {@const installing = reached?.phase === 'install'}
    {@const pct = reached?.pct}
    {@const downloaded = reached === undefined || reached.phase === 'install' || state === 'done' ? 100 : reached.pct}
    {@const installed = state === 'done' ? 100 : reached?.phase === 'install' ? reached.pct : 0}
    <!-- Only installs say how far they have got, so only a package is named. -->
    {@const title = measured ? (titles.get(key) ?? updates.titleOf(key)) : ''}
    <!--
      One bar from the first tick to the end, so that the install's green runs on to the end and stays, as the underline
      of a step done, rather than being put in its place.
    -->
    <span
      class="emma-plan-bar"
      role={measured ? 'progressbar' : undefined}
      aria-hidden={measured ? undefined : 'true'}
      aria-label={measured ? format(installing ? 'Run.InstallingOf' : 'Run.DownloadingOf', { title }) : undefined}
      aria-valuemin={measured ? 0 : undefined}
      aria-valuemax={measured ? 100 : undefined}
      aria-valuenow={measured ? pct : undefined}>
      <span class="emma-plan-bar-download" style:width="{downloaded}%"></span>
      <span class="emma-plan-bar-install" style:width="{installed}%"></span>
      {#if state === 'failed'}
        <span class="emma-plan-bar-failed" style:width="{pct ?? 100}%"></span>
      {/if}
    </span>
  {/if}
{/snippet}

<section class="emma-update-plan" aria-labelledby="{uid}-heading">
  <header>
    <h3 id="{uid}-heading">{localize('Update.Plan')}</h3>
    {#if onRun !== undefined}
      <button
        type="button"
        disabled={running || confirming}
        onclick={() => {
          confirming = true;
        }}>
        <i class="fa-solid fa-play" aria-hidden="true"></i>
        {localize('Run.Run')}
      </button>
    {/if}
    <button
      type="button"
      disabled={running}
      onclick={() => {
        updates.clear();
      }}>
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      {localize('Update.Clear')}
    </button>
  </header>
  {#if confirming && onRun !== undefined}
    <div class="emma-plan-confirm" role="alertdialog" aria-labelledby="{uid}-confirm">
      <p id="{uid}-confirm">{localize('Run.Confirm')}</p>
      <ol>
        {#each steps as step (step.key)}
          <li>{stepText(step)}</li>
        {/each}
      </ol>
      {#if !acknowledged}
        <!-- Running is the one thing that changes the installation, so an alpha's state is acknowledged first. -->
        <p class="emma-plan-alpha">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          {localize('Alpha.BeforeRun')}
          {#if onAcknowledge !== undefined}
            <button type="button" onclick={onAcknowledge}>
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              {localize('Alpha.Acknowledge')}
            </button>
          {/if}
        </p>
      {/if}
      <button
        type="button"
        disabled={!acknowledged}
        onclick={() => {
          confirming = false;
          onRun();
        }}>
        <i class="fa-solid fa-play" aria-hidden="true"></i>
        {localize('Run.Go')}
      </button>
      <button
        type="button"
        onclick={() => {
          confirming = false;
        }}>
        {localize('Run.Cancel')}
      </button>
    </div>
  {/if}
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
            <th scope="row" class="emma-plan-title">
              <label>
                <input
                  type="checkbox"
                  checked={guard.checked}
                  onchange={event => {
                    updates.setSafeguard(guard.key, { checked: event.currentTarget.checked });
                  }} />
                {nameOf(guard)}
              </label>
              {@render stateOf(guard.key)}
              {@render barOf(guard.key)}
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
        <th scope="col" aria-label={localize('Plan.Remove')}></th>
      </tr>
    </thead>
    <tbody>
      {#each updates.choices as choice (choice.key)}
        {@const older = choice.key === 'core' ? newerCore : undefined}
        {@const name = titles.get(choice.key) ?? updates.titleOf(choice.key)}
        <tr
          class={['emma-busy-host', choice.forced && 'emma-plan-forced']}
          aria-busy={updates.busy.activityOf(`plan:${choice.key}`) !== undefined}>
          <th scope="row" class="emma-plan-title">
            {#if choice.key === 'core' && coreBlocked !== undefined}
              <i
                class="fa-solid fa-triangle-exclamation emma-plan-blocked"
                role="img"
                aria-label={format('Plan.CoreBlocked', { reason: coreBlocked })}
                data-tooltip={coreBlocked}></i>
            {/if}
            <!-- Before the name, so that it adds no space between the name and what follows it. -->
            {@render barOf(choice.key)}
            <TreeLink title={name} link={linkOf(choice.key)} {onOpen} />{@render stateOf(choice.key)}
          </th>
          <td>
            {#if choice.installed === undefined}
              <span class="emma-plan-note">{localize('Install.NotInstalled')}</span>
            {:else}
              {choice.installed}
            {/if}
          </td>
          <td>
            {#if choice.chosen === UNINSTALL}
              <span class="emma-plan-uninstall">{localize('Update.Uninstall')}</span>
            {:else}
              <!-- A package installed anew is expected at its newest: one that is not stands out, as Foundry VTT's does. -->
              {@const newest =
                choice.installed === undefined && choice.forced !== true
                  ? updates.newestBeyond(choice.key, choice.chosen)
                  : undefined}
              {@const notNewest = newest === undefined ? undefined : format('Plan.NewNotNewest', { newest })}
              <!-- Its icon is drawn by CSS, so that the cell's text is the version alone, as for any other. -->
              <!-- The version and its pin together, on one line, whatever explains it below. -->
              <span class="emma-plan-chosen">
                <span
                  class={[
                    (older !== undefined || newest !== undefined) && 'emma-plan-older',
                    newest !== undefined && 'emma-plan-not-newest',
                  ]}
                  data-tooltip={notNewest}>{choice.chosen}</span>
                {#if notNewest !== undefined}
                  <span class="emma-visually-hidden">{notNewest}</span>
                {/if}
                <PinToggle {updates} key={choice.key} title={updates.titleOf(choice.key)} version={choice.chosen} />
                {#if updates.pinnedOf(choice.key) !== undefined && pinNoteOf?.(choice.key) !== undefined}
                  {@const note = pinNoteOf(choice.key)}
                  <span class="emma-plan-note" data-tooltip={note}>[{note}]</span>
                {/if}
              </span>
            {/if}
            {#if choice.by !== undefined}
              <span class="emma-plan-needed">
                {choice.through === undefined
                  ? format('Update.NeededBy', choice.by)
                  : format('Update.NeededThrough', {
                      ...choice.by,
                      through: new Intl.ListFormat('en').format(
                        choice.through.map(({ title, version }) => `${title} ${version}`),
                      ),
                    })}
              </span>
            {/if}
            {#if choice.recommendedBy !== undefined}
              <span class="emma-plan-needed">{format('Update.RecommendedBy', { title: choice.recommendedBy })}</span>
            {/if}
            {#if choice.forced}
              <span class="emma-plan-against">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                {localize('Manifest.AgainstAdvice')}
              </span>
            {/if}
            {#if older !== undefined}
              <span class="emma-plan-newer">
                {format('Plan.NotNewest', { version: older.version })}
                {#if older.kind === 'coherent'}
                  <button
                    type="button"
                    disabled={running || updates.locked}
                    onclick={() => {
                      void updates.busy.run('plan:core', 'planning', () => updates.choose('core', older.version));
                    }}>{format('Plan.ChooseNewest', { version: older.version })}</button>
                {:else if older.kind === 'conflict'}
                  {format('Plan.NewestNeeds', {
                    choices: older.remove.map(({ title, version }) => `${title} ${version}`).join(', '),
                  })}
                {:else}
                  {localize('Plan.NewestUnavailable')}
                {/if}
              </span>
            {/if}
          </td>
          <td class="emma-plan-manifest">
            {#if choice.chosen === UNINSTALL}
              <span class="emma-plan-note">{localize('Update.NothingToInstall')}</span>
            {:else if choice.manifest !== undefined}
              <a href={choice.manifest} target="_blank" rel="noopener noreferrer">{choice.manifest}</a>
            {:else if choice.key === 'core'}
              <span class="emma-plan-note">{localize('Update.CoreManifest')}</span>
            {:else}
              <span class="emma-plan-missing">{localize('Update.NoManifest')}</span>
            {/if}
          </td>
          <td class="emma-plan-remove">
            {#if updates.canTakeOut(choice.key)}
              <button
                type="button"
                aria-label={format('Plan.TakeOut', { title: name })}
                data-tooltip={format('Plan.TakeOutHint', { title: name })}
                disabled={running || updates.locked}
                onclick={event => {
                  const withNeeds = event.shiftKey;
                  void updates.busy.run(`plan:${choice.key}`, 'planning', () => updates.takeOut(choice.key, withNeeds));
                }}>
                <i class="fa-solid fa-minus" aria-hidden="true"></i>
              </button>
            {/if}
            <!-- Laid over the whole row, which it is placed against. -->
            <BusyMark activity={updates.busy.activityOf(`plan:${choice.key}`)} />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  /*
   * A package added against EMMA's advice: dark red on pale red, 10.2:1, whatever the theme, with its link the same, and
   * the triangle and the words saying it as well as the colour.
   */
  .emma-plan-forced {
    background: #f8d7da;
    color: #58151c;
  }

  .emma-plan-forced a,
  .emma-plan-forced .emma-plan-note {
    color: inherit;
  }

  .emma-plan-against {
    display: block;
    font-size: 0.85em;
    font-weight: bold;
  }

  .emma-plan-remove {
    width: 1%;
    text-align: right;
  }

  .emma-plan-remove button {
    width: auto;
    padding: 0 0.4rem;
    line-height: 1.6;
  }

  .emma-plan-needed {
    font-size: 0.85em;
    opacity: 0.8;
    font-style: italic;
  }

  .emma-plan-confirm {
    margin: 0.5rem 0;
    padding: 0.5rem;
    border: 1px solid var(--color-border, #555);
    border-radius: 4px;
  }

  .emma-plan-confirm button {
    width: auto;
  }

  .emma-plan-title {
    position: relative;
  }

  /* Along the foot of the title cell, its full width: 3px deep. */
  .emma-plan-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    overflow: hidden;
  }

  .emma-plan-bar > span {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    transition: width 0.2s linear;
  }

  .emma-plan-bar-download {
    background: var(--color-level-info, #5aa7e0);
  }

  .emma-plan-bar-install {
    background: var(--color-level-success, #18a558);
  }

  .emma-plan-bar-failed {
    background: var(--color-level-error, #d33);
  }

  .emma-plan-state {
    margin-left: 0.5rem;
    font-size: 0.85em;
  }

  .emma-plan-uninstall {
    color: var(--color-level-error, #c00);
    font-family: var(--font-primary, sans-serif);
    font-weight: bold;
  }

  .emma-plan-older {
    color: var(--color-level-warning, #ec3);
    font-weight: bold;
  }

  .emma-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Font Awesome's triangle-exclamation, as an icon element would show it. */
  .emma-plan-not-newest::before {
    content: '\f071';
    margin-right: 0.3em;
    font: var(--fa-font-solid, 900 1em 'Font Awesome 6 Free');
  }

  .emma-plan-newer {
    display: block;
    font-family: var(--font-primary, sans-serif);
    font-size: 0.85em;
  }

  .emma-plan-newer button {
    width: auto;
  }

  .emma-plan-blocked {
    margin-right: 0.25rem;
    color: var(--color-level-warning, #ec3);
  }

  .emma-plan-state-done {
    color: var(--color-level-success, #2a2);
  }

  .emma-plan-state-failed {
    color: var(--color-level-error, #c00);
  }

  .emma-plan-state-skipped {
    color: var(--color-text-subtle, #888);
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

  /* The title and the buttons stay in view as the plan's tables scroll, on the window's own background. */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--background, var(--color-cool-5, #1b1d24));
    border-bottom: 1px solid var(--color-border, #555);
  }

  header button {
    flex: none;
    width: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  /*
   * Each row's cells on the baseline of their first line, so that the name, the versions and the link line up, whatever
   * explains a change on the lines below.
   */
  th,
  td {
    text-align: left;
    vertical-align: baseline;
    padding: 0.15rem 0.5rem;
  }

  .emma-plan-chosen {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    white-space: nowrap;
  }

  /* The note on a pin, beside it, as the tree shows it. */
  .emma-plan-note {
    font-size: 0.85em;
    opacity: 0.7;
    white-space: nowrap;
  }

  .emma-plan-chosen :global(.emma-pin) {
    display: inline-flex;
  }

  tbody th {
    font-weight: normal;
  }

  td {
    font-family: var(--font-mono, monospace);
  }

  .emma-plan-alpha {
    padding: 0.25rem 0.5rem;
    border-left: 3px solid #a06c00;
    background: #fff3cd;
    color: #3d2c00;
  }

  .emma-plan-alpha button {
    width: auto;
    margin-left: 0.5rem;
  }
</style>
