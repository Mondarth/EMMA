<script lang="ts">
  import type { ModuleEntry } from '@module/adapters/modules';
  import type { HypotheticalState } from '@module/state/hypothetical.svelte';

  import VersionBadge from './VersionBadge.svelte';
  import VersionPicker from './VersionPicker.svelte';

  interface Props {
    /** The module. */
    entry: ModuleEntry;
    /** Hypothetical mode's versions while it is on; without them, the installed version's badge is shown. */
    versions?: HypotheticalState | undefined;
    /** Whether Tab stops on the version picker; the split view's lists handle the keyboard themselves. */
    focusable?: boolean;
  }

  const { entry, versions, focusable = true }: Props = $props();

  // A module with only one version found has nothing to choose, so keeps its badge.
  const chosen = $derived(versions?.hasVersions(entry.id) === true ? versions.chosen(entry.id) : undefined);
</script>

{#if versions !== undefined && chosen !== undefined}
  <VersionPicker
    title={entry.title}
    {chosen}
    {focusable}
    versions={() => versions.versionsOf(entry.id)}
    onChoose={(version: string) => {
      versions.choose(entry.id, version);
    }} />
{:else}
  <VersionBadge version={entry.version} badge={entry.badge} />
{/if}
