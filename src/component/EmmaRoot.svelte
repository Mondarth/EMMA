<script lang="ts">
  import type { Platform } from '@module/adapters/platform';
  import type { SetupReportData } from '@module/app/setup-report';
  import type { VersionJudge } from '@module/adapters/versions';
  import type { DrawerFields } from '@module/state/drawer-fields.svelte';
  import type { View } from '@module/settings';
  import { HypotheticalState } from '@module/state/hypothetical.svelte';
  import { ignoredModules } from '@module/state/hypothetical-ignored.svelte';
  import type { ModuleState } from '@module/state/module-state.svelte';

  import Footer from './Footer.svelte';
  import ListView from './ListView.svelte';
  import SplitView from './SplitView.svelte';
  import Toolbar from './Toolbar.svelte';

  interface Props {
    /** The modules shown and the changes staged to them. */
    modules: ModuleState;
    /** The view to show first. */
    initialView: View;
    /** Whether the list view groups related modules at first. */
    initialGrouped: boolean;
    /** Whether the user may change which modules are active. */
    canManage: boolean;
    /** The details shown in module drawers. */
    fields: DrawerFields;
    /** Saves the staged changes. */
    onSave: () => Promise<unknown>;
    /** Called when the user switches view, so the choice can be remembered. */
    onViewChange?: (view: View) => void;
    /** Called when the user turns the list view's grouping on or off, so the choice can be remembered. */
    onGroupedChange?: (grouped: boolean) => void;
    /** The Foundry version and game system in use. Only given to GMs, who alone are offered hypothetical mode. */
    platform?: Platform | undefined;
    /** Sets up looking up module versions for hypothetical mode; given to GMs with the platform. */
    createVersionJudge?: (() => VersionJudge) | undefined;
    /** Shows a report on the setup chosen in hypothetical mode. */
    onReport?: ((report: SetupReportData) => void) | undefined;
  }

  const {
    modules,
    initialView,
    initialGrouped,
    canManage,
    fields,
    onSave,
    onViewChange,
    onGroupedChange,
    platform,
    createVersionJudge,
    onReport,
  }: Props = $props();

  // The window is mounted afresh each time it opens, so the initial view and grouping are only read once.
  // svelte-ignore state_referenced_locally
  let view: View = $state(initialView);
  // svelte-ignore state_referenced_locally
  let grouped: boolean = $state(initialGrouped);
  // Hypothetical mode is not remembered: each time the window opens, it shows the world as it is.
  let hypothetical = $state(false);

  // Kept while the window is open, so turning the mode off and on again keeps the versions found; those chosen are
  // forgotten on leaving it. The setup judged is the modules staged active, so staging a module changes how every
  // version is judged.
  // svelte-ignore state_referenced_locally
  const versions =
    createVersionJudge === undefined
      ? undefined
      : new HypotheticalState(
          createVersionJudge,
          () => modules.active.map(({ id }) => id),
          () => ignoredModules,
        );

  // While the mode is on, look up each module as it is staged active; modules already looked up are not again.
  $effect(() => {
    if (hypothetical) void versions?.load();
  });

  /** The versions offered while hypothetical mode is on. */
  const offered = $derived(hypothetical ? versions : undefined);
</script>

<div class="emma-root">
  <Toolbar
    {view}
    {modules}
    {grouped}
    onViewChange={(next: View) => {
      if (next === view) return;
      view = next;
      onViewChange?.(next);
    }}
    onGroupedChange={(next: boolean) => {
      grouped = next;
      onGroupedChange?.(next);
    }}
    {platform}
    {hypothetical}
    {versions}
    onHypotheticalChange={(next: boolean) => {
      hypothetical = next;
      // What is staged and chosen in hypothetical mode is only for it: leaving it restores what was staged before.
      if (next) modules.enterHypothetical();
      else {
        modules.leaveHypothetical();
        versions?.clearChoices();
      }
    }}
    onReport={() => {
      const report = versions?.report();
      if (report !== null && report !== undefined) onReport?.(report);
    }} />

  <div class="emma-pane">
    {#if view === 'list'}
      <ListView {modules} {canManage} {fields} {grouped} versions={offered} />
    {:else}
      <SplitView {modules} {canManage} {fields} versions={offered} />
    {/if}
  </div>

  <Footer
    {modules}
    {canManage}
    {onSave}
    unproxied={hypothetical && versions?.proxied === false}
    hypothetical={hypothetical
      ? {
          canReset: modules.changedInHypothetical || versions?.hasChoices === true,
          reset: () => {
            modules.resetHypothetical();
            versions?.clearChoices();
          },
        }
      : undefined} />
</div>

<style>
  .emma-root {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    font-family: var(--font-body);
  }

  .emma-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
</style>
