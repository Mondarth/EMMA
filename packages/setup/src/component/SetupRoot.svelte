<!--
  EMMA on the setup screen: the installation tree, and beside it the panel for what is selected in it. Once versions
  other than the installed ones are chosen, the update plan opens below both, the full width of the
  window. A handle between the panels resizes them; each keeps its share as the window is resized.
-->
<script lang="ts">
  import { coreRefusal } from '../app/core-refusal';
  import type { SetupState } from '../app/setup-state.svelte';
  import type { Layout } from '../foundry/preferences';
  import { readLayout, writeLayout } from '../foundry/preferences';
  import { EXTENSION_RELEASES } from '../foundry/setup-kit';
  import type { InstallFilters } from '../lib/install';
  import { installable, keptSystems, pendingPackages } from '../lib/install';
  import { UNINSTALL } from '../lib/plans';
  import { stepText } from '../lib/run';
  import { groupDetail, moduleDetail, systemDetail } from '../lib/details';
  import { EMMA_VERSION } from '../lib/alpha';
  import { format, localize } from '../lib/i18n';
  import { isIgnored } from '../lib/overview';
  import type { TreeRow, TreeSelection } from '../lib/tree';
  import { ROOT, allRows, ignoreKeyOf, rowFor } from '../lib/tree';
  import GroupPanel from './GroupPanel.svelte';
  import InstallationTree from './InstallationTree.svelte';
  import ModulePanel from './ModulePanel.svelte';
  import RootPanel from './RootPanel.svelte';
  import Splitter from './Splitter.svelte';
  import SystemPanel from './SystemPanel.svelte';
  import CoreStep from './CoreStep.svelte';
  import AlphaNotice from './AlphaNotice.svelte';
  import BusyMark from './BusyMark.svelte';
  import OpeningMark from './OpeningMark.svelte';
  import FailedStep from './FailedStep.svelte';
  import WhyChosen from './WhyChosen.svelte';
  import SavedPlanNotice from './SavedPlanNotice.svelte';
  import BestSection from './BestSection.svelte';
  import InstallSection from './InstallSection.svelte';
  import IgnoreSection from './IgnoreSection.svelte';
  import LockSection from './LockSection.svelte';
  import RecommendsSection from './RecommendsSection.svelte';
  import UninstallSection from './UninstallSection.svelte';
  import UpdatePlan from './UpdatePlan.svelte';
  import WorldPanel from './WorldPanel.svelte';

  interface Props {
    setup: SetupState;
  }

  let { setup }: Props = $props();

  /** The row selected, by its key, and what it shows. */
  let selected = $state<{ key: string; selection: TreeSelection }>({ key: ROOT, selection: { kind: 'root' } });

  const overview = $derived(setup.overview);
  const updates = $derived(setup.updates);
  const planOpen = $derived(updates.choices.length > 0);
  /** The build of Foundry VTT a run stopped before updating to, while the plan still has it. */
  const coreStop = $derived.by(() => {
    const version = setup.run?.beforeCore;
    return updates.plan.some(entry => entry.key === 'core' && entry.version === version) ? version : undefined;
  });
  /** The build of Foundry VTT the plan chose, if it changes Foundry VTT. */
  const coreChosen = $derived(updates.plan.find(entry => entry.key === 'core')?.version);
  // Where updating in place may be offered, Foundry is asked which build it would install, so that the plan can say
  // before a run whether it can update in place.
  $effect(() => {
    if (coreChosen !== undefined && setup.coreUpdate.canUpdate) void setup.checkCoreTarget();
  });
  /** Why the plan's build of Foundry VTT cannot be updated to in place, if it cannot. */
  const coreBlocked = $derived(
    coreChosen === undefined ? undefined : coreRefusal(coreChosen, setup.coreUpdate, setup.coreTarget),
  );
  // The plan offers a snapshot, so the space one needs is asked for once the plan opens.
  $effect(() => {
    if (planOpen) void setup.checkSnapshotSpace();
  });
  const updateCount = $derived(updates.search?.updates.size ?? 0);

  let layout = $state<Layout>(readLayout());

  /**
   * Resize a panel, and keep the sizes for next time.
   * @param change - The panel's new share
   */
  function resize(change: Partial<Layout>): void {
    layout = { ...layout, ...change };
    writeLayout(layout);
  }

  /** What the catalogue said of the last search, if it was asked. */
  const catalogue = $derived(updates.search?.catalogue);
  /** What the footer says of how fresh the catalogue's versions are, and what it is fetching. */
  const catalogueNotes = $derived.by(() => {
    if (updates.status !== 'found' || catalogue === undefined || !catalogue.reached) return [];
    const { pending, checkedAt } = catalogue;
    return [
      ...(pending.length > 0 ? [format('Update.Pending', { count: pending.length })] : []),
      ...(checkedAt === null
        ? []
        : [
            format('Update.Checked', {
              time: new Date(checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
            }),
          ]),
    ];
  });

  /** What the footer says of the search for updates. */
  const updateStatus = $derived.by(() => {
    if (setup.installing) return localize('Update.Installing');
    switch (updates.status) {
      case 'failed':
        return localize('Update.Failed');
      case 'unavailable':
        return problemText();
      case 'found':
        if (catalogue?.reached === false) return localize('Update.Unreachable');
        return updateCount === 0 ? localize('Update.None') : format('Update.Found', { count: updateCount });
      default:
        // The search starts as soon as the installation is read.
        return localize('Update.Searching');
    }
  });
  /** What the footer says of the last run of the plan. */
  const runStatus = $derived.by(() => {
    const run = setup.shownRun;
    const { resumed: restored } = setup;
    if (restored !== null && run === null) {
      const resumed =
        restored.core === undefined ? localize('Saved.Resumed') : format('Core.Resumed', { version: restored.core });
      const { unrestored } = setup;
      return unrestored.length === 0
        ? resumed
        : `${resumed} ${format('Core.NotRestored', { packages: unrestored.join(', ') })}`;
    }
    if (run === null) return undefined;
    if (!run.over) return localize('Run.Running');
    if (run.failure !== undefined) {
      const notRun = Object.keys(run.needed ?? {}).length;
      return [
        format('Run.Failed', { step: stepText(run.failure.step), message: run.failure.message }),
        ...((run.failed ?? 1) > 1 ? [format('Run.MoreFailed', { count: String((run.failed ?? 1) - 1) })] : []),
        ...(notRun > 0 ? [format('Run.NotRun', { count: String(notRun) })] : []),
        localize('Run.FailedHint'),
      ].join(' ');
    }
    if (run.beforeCore === undefined) return localize('Run.Ran');
    const stopped = format('Run.BeforeCore', { version: run.beforeCore });
    return `${stopped} ${localize(run.kept === true ? 'Core.Kept' : 'Core.NotKept')}`;
  });
  const unresolved = $derived(updates.search?.unresolved.length ?? 0);
  const problem = $derived(updates.status === 'unavailable' ? updates.problem : null);

  /**
   * What the footer says when the search for updates cannot be made.
   * @returns Why, in words
   */
  function problemText(): string {
    switch (problem?.reason) {
      case 'module-too-old':
        return format('Update.ModuleTooOld', { version: problem.version });
      case 'extension-too-old':
        return format('Update.ExtensionTooOld', { version: problem.version });
      default:
        return localize('Update.NeedsModule');
    }
  }
  const selection = $derived(selected.selection);
  /** Whether EMMA ignores what the panel shows. */
  const ignoredShown = $derived(overview !== null && isIgnored(overview, ignoreKeyOf(selection) ?? ''));
  /**
   * The packages the plan installs anew, as the tree shows them, pending.
   * @returns The packages
   */
  function pendingNow() {
    const listing = setup.listings.module;
    return pendingPackages(updates.choices, key => updates.titleOf(key), Array.isArray(listing) ? listing : []);
  }

  /** The row of the tree a panel's name last linked to, for the tree to open to; a new object for each link. */
  let revealing = $state.raw<{ readonly key: string } | null>(null);

  /**
   * Open the tree to the row a panel's name links to, and select it.
   * @param link - What the name links to, as a row's selection
   */
  function openLink(link: TreeSelection): void {
    // Panels show only once the installation is read.
    if (overview !== null) {
      const row = rowFor(allRows(overview, pendingNow()), link);
      if (row !== undefined) revealing = { key: row.key };
    }
  }
  /** The type of package the selected group offers to install, if it offers any. */
  const installType = $derived(
    selection.kind === 'systems'
      ? 'system'
      : selection.kind === 'modules' || selection.kind === 'group'
        ? 'module'
        : undefined,
  );
  /**
   * What the modules the selected group offers to install are for: universal, or a game system, by its title as the
   * installation or the plan gives it, or else its ID, as the tree names it; none outside a group.
   */
  const installScope = $derived.by(() => {
    if (selection.kind !== 'group') return undefined;
    if (selection.system === undefined) return localize('Tree.Universal');
    const key = `system:${selection.system}`;
    const title = updates.titleOf(key);
    return title === key ? selection.system : title;
  });
  /** The packages on Foundry's listing that fit the installation and the plan, as the selected group shows them. */
  const installablePackages = $derived.by(() => {
    const listing = installType === undefined ? null : setup.listings[installType];
    if (installType === undefined || overview === null || typeof listing !== 'object' || listing === null) return [];
    const kept = keptSystems(overview, updates.picks);
    const fits = installable(
      listing,
      overview,
      { core: updates.chosenOf('core') ?? overview.core, systems: kept },
      setup.installFilters[installType],
    );
    // A system's group offers the modules for it, and the universal group those for any system.
    if (selection.kind !== 'group') return fits;
    const { system } = selection;
    return fits.filter(pkg => (system === undefined ? pkg.systems.length === 0 : pkg.systems.includes(system)));
  });
  /**
   * Change how the user narrows what a listing offers.
   * @param type - Which listing
   * @param change - The filters that change
   */
  function filterInstall(type: 'module' | 'system', change: Partial<InstallFilters>): void {
    setup.setInstallFilters(type, change);
  }
  // What is selected, if it is still there: after reading again, a world may have gone.
  const world = $derived(
    selection.kind === 'world' ? overview?.worlds.find(({ world: { id } }) => id === selection.world) : undefined,
  );
</script>

{#snippet lock(key: string)}
  {@const id = key.slice(key.indexOf(':') + 1)}
  {@const pkg = key.startsWith('system:')
    ? overview?.systems.find(system => system.id === id)
    : overview?.modules.find(({ module: installed }) => installed.id === id)?.module}
  {#if pkg !== undefined && setup.canLock}
    <LockSection
      title={pkg.title}
      version={pkg.version}
      locked={pkg.locked === true}
      disabled={updates.locked || setup.running}
      busy={updates.busy.activityOf(`lock:${key}`)}
      onLock={(locking: boolean) => {
        void updates.busy.run(`lock:${key}`, 'locking', () => setup.setLocked(key, locking));
      }} />
  {/if}
{/snippet}

{#snippet ignore(key: string, title: string)}
  {#if overview !== null && setup.canIgnore}
    <IgnoreSection
      {title}
      world={key.startsWith('world:')}
      ignored={isIgnored(overview, key)}
      disabled={updates.locked || setup.running}
      busy={updates.busy.activityOf(`ignore:${key}`)}
      onIgnore={(ignoring: boolean) => {
        void updates.busy.run(`ignore:${key}`, 'ignoring', () => setup.setIgnored(key, ignoring));
      }} />
  {/if}
{/snippet}

{#snippet ignoreInstalled(key: string)}
  {@const id = key.slice(key.indexOf(':') + 1)}
  {@const pkg = key.startsWith('system:')
    ? overview?.systems.find(system => system.id === id)
    : overview?.modules.find(({ module: installed }) => installed.id === id)?.module}
  {#if pkg !== undefined}
    {@render ignore(key, pkg.title)}
  {/if}
{/snippet}

<!--
  The actions on what the panel shows, just below its title, side by side, each its own title: none it cannot take.
-->
{#snippet packageActions()}
  {@const key =
    selection.kind === 'module'
      ? `module:${selection.module}`
      : selection.kind === 'system'
        ? `system:${selection.system}`
        : undefined}
  {#if key !== undefined}
    <div class="emma-actions" role="group" aria-label={localize('Action.Label')}>
      {@render lock(key)}
      {@render ignoreInstalled(key)}
      {@render uninstall(key)}
    </div>
  {/if}
{/snippet}

{#snippet worldActions()}
  {#if world !== undefined}
    <div class="emma-actions" role="group" aria-label={localize('Action.Label')}>
      {@render ignore(`world:${world.world.id}`, world.world.title)}
    </div>
  {/if}
{/snippet}

<!-- Foundry VTT's, with planning the best versions just below them, as what is most often done from the root. -->
{#snippet rootActions()}
  {#if setup.canLockCore && overview !== null}
    <div class="emma-actions" role="group" aria-label={localize('Action.Label')}>
      <LockSection
        core
        title={localize('Tree.Root')}
        version={overview.core}
        locked={overview.coreLocked === true}
        disabled={updates.locked || setup.running}
        busy={updates.busy.activityOf('lock:core')}
        onLock={(locking: boolean) => {
          void updates.busy.run('lock:core', 'locking', () => setup.setCoreLocked(locking));
        }} />
    </div>
  {/if}
  <BestSection
    {updates}
    disabled={updates.locked || setup.running}
    inUseOnly={setup.bestInUseOnly}
    onInUseOnlyChange={(on: boolean) => {
      setup.setBestInUseOnly(on);
    }} />
{/snippet}

{#snippet uninstall(key: string)}
  {@const offer = updates.uninstallOf(key)}
  {#if offer !== undefined}
    <UninstallSection
      title={updates.titleOf(key)}
      {offer}
      locked={updates.locked}
      busy={updates.busy.activityOf(`uninstall:${key}`)}
      onChoose={(remove: boolean) => {
        void updates.busy.run(`uninstall:${key}`, 'planning', () =>
          updates.choose(key, remove ? UNINSTALL : offer.installed),
        );
      }} />
  {/if}
{/snippet}

<div class="emma-setup">
  {#if setup.opening}
    <OpeningMark />
  {/if}
  {#if overview === null}
    <p class="emma-setup-message" role="status">
      {setup.failed ? localize('App.LoadFailed') : localize('App.Loading')}
    </p>
  {:else}
    <div class="emma-setup-body">
      <div class="emma-setup-main" style:--emma-tree-share="{layout.tree * 100}%">
        <InstallationTree
          reveal={revealing}
          {overview}
          {updates}
          pending={pendingNow()}
          selected={selected.key}
          onSelect={(row: TreeRow) => {
            selected = { key: row.key, selection: row.selection };
          }} />
        <Splitter
          orientation="vertical"
          sizes="before"
          value={layout.tree}
          min={0.15}
          max={0.85}
          label={localize('Layout.Tree')}
          onChange={(tree: number) => {
            resize({ tree });
          }} />
        <section class="emma-setup-panel">
          {#if ignoredShown}
            <!-- It stays in view as the panel scrolls, so that what the panel says is never taken for what plans use. -->
            <div class="emma-setup-ignored" role="note">
              <strong>{localize('Ignore.Badge')}</strong>
              <span>{localize('Ignore.BadgeNote')}</span>
            </div>
          {/if}
          {#if selection.kind === 'module'}
            <FailedStep run={setup.shownRun} key={`module:${selection.module}`} />
            <ModulePanel
              actions={packageActions}
              detail={moduleDetail(overview, selection.module, selection.world)}
              onOpen={openLink}
              blocked={updates.blockedOf(`module:${selection.module}`)}
              explained={updates.explainedOf(`module:${selection.module}`)} />
            <WhyChosen {updates} key={`module:${selection.module}`} />
            <RecommendsSection key={`module:${selection.module}`} {updates} onOpen={openLink} />
          {:else if selection.kind === 'system'}
            <FailedStep run={setup.shownRun} key={`system:${selection.system}`} />
            <SystemPanel
              actions={packageActions}
              detail={systemDetail(overview, selection.system, selection.world)}
              onOpen={openLink}
              blocked={updates.blockedOf(`system:${selection.system}`)}
              explained={updates.explainedOf(`system:${selection.system}`)} />
            <WhyChosen {updates} key={`system:${selection.system}`} />
          {:else if selection.kind === 'worlds' || selection.kind === 'systems' || selection.kind === 'modules' || selection.kind === 'group'}
            <GroupPanel detail={groupDetail(overview, selection)} onOpen={openLink} />
            {#if installType !== undefined && setup.canInstall}
              <InstallSection
                type={installType}
                listing={setup.listings[installType]}
                scope={installScope}
                packages={installablePackages}
                filters={setup.installFilters[installType]}
                {updates}
                onFilter={(change: Partial<InstallFilters>) => {
                  filterInstall(installType, change);
                }}
                onShow={(type: 'module' | 'system') => {
                  void setup.loadListing(type);
                }} />
            {/if}
          {:else if world !== undefined}
            <WorldPanel {world} onOpen={openLink} actions={worldActions} />
          {:else}
            <RootPanel
              actions={rootActions}
              {overview}
              onOpen={openLink}
              guardOn={setup.guardOn}
              blocked={updates.blockedOf('core')}
              explained={updates.explainedOf('core')}
              onGuardChange={(on: boolean) => {
                setup.setGuardOn(on);
              }} />
          {/if}
        </section>
      </div>
      {#if planOpen}
        <Splitter
          orientation="horizontal"
          sizes="after"
          value={layout.plan}
          min={0.15}
          max={0.75}
          label={localize('Layout.Plan')}
          onChange={(plan: number) => {
            resize({ plan });
          }} />
        <div class="emma-setup-plan" style:flex-basis="{layout.plan * 100}%">
          {#if coreStop !== undefined}
            <CoreStep
              version={coreStop}
              core={setup.coreUpdate}
              target={setup.coreTarget}
              updating={setup.coreUpdating}
              onUpdate={() => {
                void setup.updateCoreInPlace();
              }} />
          {/if}
          <UpdatePlan
            {overview}
            {updates}
            space={setup.snapshotSpace}
            {coreBlocked}
            run={setup.shownRun}
            onOpen={openLink}
            acknowledged={setup.alphaAcknowledged}
            onAcknowledge={() => {
              setup.acknowledgeAlpha();
            }}
            onRun={setup.canRun
              ? () => {
                  void setup.runPlan();
                }
              : undefined} />
        </div>
      {/if}
    </div>
  {/if}
  <footer class="emma-setup-footer">
    {#if setup.isAlpha}
      <AlphaNotice
        version={EMMA_VERSION}
        acknowledged={setup.alphaAcknowledged}
        onAcknowledge={() => {
          setup.acknowledgeAlpha();
        }} />
    {/if}
    {#if setup.savedPlan !== null}
      <SavedPlanNotice
        count={setup.savedPlan.picks.length}
        busy={updates.busy.activityOf('resume')}
        onResume={() => {
          void updates.busy.run('resume', 'resuming', () => setup.resumeSaved());
        }}
        onDiscard={() => {
          setup.discardSaved();
        }} />
    {/if}
    {#if overview !== null}
      <p class="emma-setup-status" role="status">
        {updateStatus}
        {#if unresolved > 0}
          <span class="emma-setup-note">{format('Update.Unresolved', { count: unresolved })}</span>
        {/if}
        {#each catalogueNotes as note (note)}
          <span class="emma-setup-note">{note}</span>
        {/each}
        {#if runStatus !== undefined}
          <span class="emma-setup-note">{runStatus}</span>
        {/if}
      </p>
      {#if problem?.reason === 'extension-too-old'}
        <a class="emma-setup-get" href={EXTENSION_RELEASES} target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          {localize('Update.UpdateExtension')}
        </a>
      {:else if problem !== null}
        <button
          type="button"
          class="emma-setup-get"
          disabled={setup.installing}
          onclick={() => {
            void setup.installModule();
          }}>
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          {localize(problem.reason === 'missing' ? 'Update.InstallModule' : 'Update.UpdateModule')}
        </button>
      {/if}
    {/if}
    {#if catalogue?.reached === true}
      <button
        type="button"
        class="emma-setup-check emma-busy-host"
        aria-busy={updates.busy.activityOf('check-live') !== undefined}
        data-tooltip={localize('Update.CheckLiveHint')}
        disabled={updates.checking ||
          updates.locked ||
          updates.status !== 'found' ||
          updates.busy.activityOf('check-live') !== undefined}
        onclick={() => {
          void updates.busy.run('check-live', 'checking', () => updates.checkLive());
        }}>
        <i class="fa-solid fa-satellite-dish" aria-hidden="true"></i>
        {localize('Update.CheckLive')}
        <BusyMark activity={updates.busy.activityOf('check-live')} />
      </button>
    {/if}
    <button
      type="button"
      class="emma-setup-refresh emma-busy-host"
      aria-busy={updates.busy.activityOf('refresh') !== undefined}
      disabled={setup.loading || updates.busy.activityOf('refresh') !== undefined}
      onclick={() => {
        void updates.busy.run('refresh', 'refreshing', () => setup.refresh());
      }}>
      <i class="fa-solid fa-rotate" aria-hidden="true"></i>
      {localize('App.Refresh')}
      <BusyMark activity={updates.busy.activityOf('refresh')} />
    </button>
  </footer>
</div>

<style>
  /* The actions side by side, wrapping only where the panel is too narrow for them. */
  .emma-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 1rem;
  }

  .emma-actions:has(:global(.emma-action)) {
    margin-bottom: 0.75rem;
  }

  .emma-setup {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-family: var(--font-primary, sans-serif);
  }

  .emma-setup-message {
    flex: 1;
    align-content: center;
    text-align: center;
  }

  .emma-setup-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .emma-setup-main {
    display: grid;
    grid-template-columns: var(--emma-tree-share) auto minmax(0, 1fr);
    flex: 1 1 0;
    min-height: 0;
  }

  .emma-setup-main > :global(*) {
    min-height: 0;
  }

  .emma-setup-panel {
    overflow: auto;
    padding: 0 1rem;
  }

  /* Space above each section's heading, to set the sections apart. */
  .emma-setup-panel :global(h3) {
    margin-top: 1.25rem;
  }

  /* At least three lines high, in the panel's top right corner, to catch the eye wherever the panel is scrolled. */
  .emma-setup-ignored {
    position: sticky;
    top: 0.5rem;
    z-index: 1;
    float: right;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    min-height: 4.5rem;
    max-width: 12rem;
    margin: 0.5rem 0 0.5rem 1rem;
    padding: 0.5rem 1rem;
    border: 3px solid var(--color-level-error, #c00);
    border-radius: 6px;
    background: var(--color-bg-option, #fff);
    color: var(--color-level-error, #c00);
    box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
    text-align: center;
  }

  .emma-setup-ignored strong {
    font-size: 1.6em;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .emma-setup-ignored span {
    font-size: 0.85em;
  }

  .emma-setup-plan {
    display: flex;
    flex-direction: column;
    flex-grow: 0;
    flex-shrink: 0;
    min-height: 0;
    overflow: auto;
  }

  .emma-setup-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #555);
  }

  .emma-setup-footer button {
    flex: none;
    width: auto;
  }

  .emma-setup-check,
  .emma-setup-refresh {
    margin-left: auto;
  }

  .emma-setup-check + .emma-setup-refresh {
    margin-left: 0;
  }

  .emma-setup-status {
    flex: 1;
    margin: 0;
  }

  .emma-setup-note {
    font-size: 0.9em;
    opacity: 0.85;
  }
</style>
