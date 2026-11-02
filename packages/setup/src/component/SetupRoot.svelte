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
  import { installable } from '../lib/install';
  import { UNINSTALL } from '../lib/plans';
  import { stepText } from '../lib/run';
  import { groupDetail, moduleDetail, systemDetail } from '../lib/details';
  import { format, localize } from '../lib/i18n';
  import type { TreeRow, TreeSelection } from '../lib/tree';
  import { ROOT } from '../lib/tree';
  import GroupPanel from './GroupPanel.svelte';
  import InstallationTree from './InstallationTree.svelte';
  import ModulePanel from './ModulePanel.svelte';
  import RootPanel from './RootPanel.svelte';
  import Splitter from './Splitter.svelte';
  import SystemPanel from './SystemPanel.svelte';
  import CoreStep from './CoreStep.svelte';
  import InstallSection from './InstallSection.svelte';
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

  /** What the footer says of the search for updates. */
  const updateStatus = $derived.by(() => {
    if (setup.installing) return localize('Update.Installing');
    switch (updates.status) {
      case 'failed':
        return localize('Update.Failed');
      case 'unavailable':
        return problemText();
      case 'found':
        return updateCount === 0 ? localize('Update.None') : format('Update.Found', { count: updateCount });
      default:
        // The search starts as soon as the installation is read.
        return localize('Update.Searching');
    }
  });
  /** What the footer says of the last run of the plan. */
  const runStatus = $derived.by(() => {
    const { run } = setup;
    if (setup.resumedOn !== null && run === null) return format('Core.Resumed', { version: setup.resumedOn });
    if (run === null) return undefined;
    if (!run.over) return localize('Run.Running');
    if (run.failure !== undefined) {
      return format('Run.Failed', { step: stepText(run.failure.step), message: run.failure.message });
    }
    return run.beforeCore === undefined ? localize('Run.Ran') : format('Run.BeforeCore', { version: run.beforeCore });
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
  /** The type of package the selected group offers to install, if it offers any. */
  const installType = $derived(
    selection.kind === 'systems'
      ? 'system'
      : selection.kind === 'modules' || selection.kind === 'group'
        ? 'module'
        : undefined,
  );
  /** The packages on Foundry's listing that fit the installation and the plan, as the selected group shows them. */
  const installablePackages = $derived.by(() => {
    const listing = installType === undefined ? null : setup.listings[installType];
    if (overview === null || typeof listing !== 'object' || listing === null) return [];
    const kept = overview.systems.map(({ id }) => id).filter(id => updates.chosenOf(`system:${id}`) !== UNINSTALL);
    const fits = installable(listing, overview, { core: updates.chosenOf('core') ?? overview.core, systems: kept });
    // A system's group offers the modules for it, and the universal group those for any system.
    if (selection.kind !== 'group') return fits;
    const { system } = selection;
    return fits.filter(pkg => (system === undefined ? pkg.systems.length === 0 : pkg.systems.includes(system)));
  });
  // What is selected, if it is still there: after reading again, a world may have gone.
  const world = $derived(
    selection.kind === 'world' ? overview?.worlds.find(({ world: { id } }) => id === selection.world) : undefined,
  );
</script>

{#snippet uninstall(key: string)}
  {@const offer = updates.uninstallOf(key)}
  {#if offer !== undefined}
    <UninstallSection
      title={updates.titleOf(key)}
      {offer}
      locked={updates.locked}
      onChoose={(remove: boolean) => {
        void updates.choose(key, remove ? UNINSTALL : offer.installed);
      }} />
  {/if}
{/snippet}

<div class="emma-setup">
  {#if overview === null}
    <p class="emma-setup-message" role="status">
      {setup.failed ? localize('App.LoadFailed') : localize('App.Loading')}
    </p>
  {:else}
    <div class="emma-setup-body">
      <div class="emma-setup-main" style:--emma-tree-share="{layout.tree * 100}%">
        <InstallationTree
          {overview}
          {updates}
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
          {#if selection.kind === 'module'}
            <ModulePanel
              detail={moduleDetail(overview, selection.module, selection.world)}
              blocked={updates.blockedOf(`module:${selection.module}`)}
              explained={updates.explainedOf(`module:${selection.module}`)} />
            {@render uninstall(`module:${selection.module}`)}
          {:else if selection.kind === 'system'}
            <SystemPanel
              detail={systemDetail(overview, selection.system, selection.world)}
              blocked={updates.blockedOf(`system:${selection.system}`)}
              explained={updates.explainedOf(`system:${selection.system}`)} />
            {@render uninstall(`system:${selection.system}`)}
          {:else if selection.kind === 'systems' || selection.kind === 'modules' || selection.kind === 'group'}
            <GroupPanel detail={groupDetail(overview, selection)} />
            {#if installType !== undefined && setup.canInstall}
              <InstallSection
                type={installType}
                listing={setup.listings[installType]}
                packages={installablePackages}
                {updates}
                onShow={(type: 'module' | 'system') => {
                  void setup.loadListing(type);
                }} />
            {/if}
          {:else if world !== undefined}
            <WorldPanel {world} />
          {:else}
            <RootPanel
              {overview}
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
            run={setup.run}
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
    {#if overview !== null}
      <p class="emma-setup-status" role="status">
        {updateStatus}
        {#if unresolved > 0}
          <span class="emma-setup-note">{format('Update.Unresolved', { count: unresolved })}</span>
        {/if}
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
    <button
      type="button"
      class="emma-setup-refresh"
      disabled={setup.loading}
      onclick={() => {
        void setup.refresh();
      }}>
      <i class="fa-solid fa-rotate" aria-hidden="true"></i>
      {localize('App.Refresh')}
    </button>
  </footer>
</div>

<style>
  .emma-setup {
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
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #555);
  }

  .emma-setup-footer button {
    flex: none;
    width: auto;
  }

  .emma-setup-refresh {
    margin-left: auto;
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
