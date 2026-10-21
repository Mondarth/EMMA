<script lang="ts">
  import type { Platform } from '@module/adapters/platform';
  import type { PackageRef, PlatformPart } from '@module/adapters/versions';
  import { format, formatList, localize } from '@module/lib/i18n';
  import type { HypotheticalState } from '@module/state/hypothetical.svelte';
  import type { View } from '@module/settings';
  import type { ModuleState } from '@module/state/module-state.svelte';

  import VersionPicker from './VersionPicker.svelte';

  interface Props {
    /** The view shown. */
    view: View;
    /** The modules, whose drawers the expand button opens and closes. */
    modules: ModuleState;
    /** Whether the list view groups related modules; its toggle is only offered in the list view. */
    grouped?: boolean;
    /** Called when the user picks a view. */
    onViewChange: (view: View) => void;
    /** Called when the user turns the list view's grouping on or off. */
    onGroupedChange?: (grouped: boolean) => void;
    /** The Foundry version and game system in use. Only given to GMs, who alone are offered hypothetical mode. */
    platform?: Platform | undefined;
    /** Whether hypothetical mode is on. */
    hypothetical?: boolean;
    /** Called when the user turns hypothetical mode on or off. */
    onHypotheticalChange?: (hypothetical: boolean) => void;
    /** Hypothetical mode's versions, whose lookup the toolbar reports on while the mode is on. */
    versions?: HypotheticalState | undefined;
  }

  const {
    view,
    modules,
    grouped = true,
    onViewChange,
    onGroupedChange,
    platform,
    hypothetical = false,
    onHypotheticalChange,
    versions,
  }: Props = $props();

  /**
   * The title of a package in use.
   * @param ref - The package
   * @returns Its title, or its ID if it is not known
   */
  function titleOf(ref: PackageRef): string {
    if (ref.type === 'core') return localize('MONDARTH-EMMA.Versions.Core');
    if (ref.type === 'system') return platform?.system.id === ref.id ? platform.system.title : ref.id;
    return modules.entries.find(entry => entry.id === ref.id)?.title ?? ref.id;
  }

  /** What the toolbar says about looking up versions: nothing once every version was found. */
  const lookup = $derived.by((): { icon: string; label: string } | null => {
    switch (versions?.status) {
      case 'loading':
        return { icon: 'fa-spinner fa-spin', label: localize('MONDARTH-EMMA.Versions.Loading') };
      case 'failed':
        return { icon: 'fa-triangle-exclamation', label: localize('MONDARTH-EMMA.Versions.Failed') };
      case 'ready':
        return versions.unreached.length === 0
          ? null
          : {
              icon: 'fa-triangle-exclamation',
              label: format('MONDARTH-EMMA.Versions.Unreached', {
                packages: formatList(versions.unreached.map(titleOf)),
              }),
            };
      default:
        return null;
    }
  });

  const hypotheticalLabel = $derived(localize('MONDARTH-EMMA.Toolbar.Hypothetical'));

  const groupLabel = $derived(localize('MONDARTH-EMMA.Toolbar.Group'));

  // As in Foundry's Module Management: the chevrons point up while the button expands, and down while it collapses.
  const expandLabel = $derived(
    localize(modules.allExpanded ? 'MONDARTH-EMMA.Toolbar.Collapse' : 'MONDARTH-EMMA.Toolbar.Expand'),
  );

  const VIEWS: readonly { view: View; icon: string; label: string }[] = [
    { view: 'list', icon: 'fa-list', label: 'MONDARTH-EMMA.Toolbar.List' },
    { view: 'split', icon: 'fa-table-columns', label: 'MONDARTH-EMMA.Toolbar.Split' },
  ];
</script>

<!-- The core's or the system's version: a list to choose from once a newer one is found. -->
{#snippet platformButton(part: PlatformPart, title: string, version: string, text: string, label: string)}
  {#if versions !== undefined && versions.hasPlatformVersions(part)}
    <VersionPicker
      {title}
      chosen={{ version, badge: null }}
      versions={() => versions.platformVersionsOf(part)}
      onChoose={(chosen: string) => {
        versions.choosePlatform(part, chosen);
      }}>{text}</VersionPicker>
  {:else}
    <button type="button" aria-label={label} data-tooltip={label}>{text}</button>
  {/if}
{/snippet}

<div class="emma-toolbar" role="toolbar" aria-label={localize('MONDARTH-EMMA.Toolbar.Label')}>
  {#if platform !== undefined}
    <div class="emma-toolbar-hypothetical">
      <button
        type="button"
        class={['icon', 'fa-solid', 'fa-flask', { active: hypothetical }]}
        aria-label={hypotheticalLabel}
        aria-pressed={hypothetical}
        data-tooltip={hypotheticalLabel}
        onclick={() => {
          onHypotheticalChange?.(!hypothetical);
        }}></button>
      {#if hypothetical}
        {@const core = versions?.platformChosen('core') ?? platform.core}
        {@const system = versions?.platformChosen('system') ?? platform.system.version}
        <div class="emma-toolbar-platform">
          <!-- The buttons show just the versions; their names and tooltips say what each is. -->
          {@render platformButton(
            'core',
            localize('MONDARTH-EMMA.Versions.Core'),
            core,
            core,
            format('MONDARTH-EMMA.Toolbar.CoreTooltip', { version: core }),
          )}
          {@render platformButton(
            'system',
            platform.system.title,
            system,
            format('MONDARTH-EMMA.Toolbar.System', { id: platform.system.id, version: system }),
            format('MONDARTH-EMMA.Toolbar.SystemTooltip', { title: platform.system.title, version: system }),
          )}
          {#if lookup !== null}
            <i
              class={['emma-toolbar-lookup', 'fa-solid', lookup.icon, { failed: versions?.status === 'failed' }]}
              role="status"
              aria-label={lookup.label}
              data-tooltip={lookup.label}></i>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
  {#if view === 'list'}
    <button
      type="button"
      class={['emma-toolbar-group', 'icon', 'fa-solid', 'fa-sitemap', { active: grouped }]}
      aria-label={groupLabel}
      aria-pressed={grouped}
      data-tooltip={groupLabel}
      onclick={() => {
        onGroupedChange?.(!grouped);
      }}></button>
  {/if}
  <div class="emma-toolbar-views">
    {#each VIEWS as option (option.view)}
      {@const label = localize(option.label)}
      {@const pressed = view === option.view}
      <button
        type="button"
        class={['icon', 'fa-solid', option.icon, { active: pressed }]}
        aria-label={label}
        aria-pressed={pressed}
        data-tooltip={label}
        onclick={() => {
          onViewChange(option.view);
        }}></button>
    {/each}
  </div>
  <button
    type="button"
    class={['emma-toolbar-expand', 'icon', 'fa-solid', modules.allExpanded ? 'fa-angles-down' : 'fa-angles-up']}
    aria-label={expandLabel}
    data-tooltip={expandLabel}
    disabled={modules.entries.length === 0}
    onclick={() => {
      modules.setAllExpanded(!modules.allExpanded);
    }}></button>
</div>

<style>
  .emma-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  /* Hypothetical mode sits at the far left, apart from the controls that arrange the list. */
  .emma-toolbar-hypothetical {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-inline-end: auto;
  }

  /* Slightly apart from the toggle, as they only appear while it is on. */
  .emma-toolbar-platform {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-inline-start: 0.5rem;
  }

  .emma-toolbar-platform > :global(button) {
    flex: none;
    width: auto;
    padding-inline: 0.5rem;
    white-space: nowrap;
  }

  .emma-toolbar-lookup {
    margin-inline-start: 0.25rem;
    color: var(--color-text-secondary);
  }

  .emma-toolbar-lookup.failed {
    color: var(--color-level-error);
  }

  .emma-toolbar-views {
    display: flex;
    gap: 0.25rem;
  }

  /* Set apart from the view buttons, since it changes how the list view is arranged rather than choosing a view. */
  .emma-toolbar-group {
    margin-inline-end: 0.5rem;
  }

  /* Set apart from the view buttons, since it acts on the drawers rather than choosing a view. */
  .emma-toolbar-expand {
    margin-inline-start: 1rem;
  }
</style>
