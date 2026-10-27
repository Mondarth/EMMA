<script lang="ts">
  import type { ModuleEntry, VersionBadge as Badge } from '@module/adapters/modules';
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
    /** The badges EMMA's checks give the installed modules, when the user chose them; Foundry's own otherwise. */
    badges?: ReadonlyMap<string, Badge | null> | undefined;
  }

  const { entry, versions, focusable = true, badges }: Props = $props();

  // The installed version's badge: EMMA's, if its checks judged it, or else Foundry's own.
  const installed = $derived(badges?.has(entry.id) === true ? (badges.get(entry.id) ?? null) : entry.badge);

  // The version chosen, judged in the setup of the core, the system and the modules staged active; undefined for a
  // module not judged, which keeps the badge Foundry gives the installed version.
  const chosen = $derived(versions?.chosen(entry.id));
</script>

<!-- A module with only one version found has nothing to choose, so shows its judged badge alone. -->
{#if versions !== undefined && chosen !== undefined && versions.hasVersions(entry.id)}
  <VersionPicker
    title={entry.title}
    {chosen}
    {focusable}
    versions={() => versions.versionsOf(entry.id)}
    onChoose={(version: string) => {
      versions.choose(entry.id, version);
    }} />
{:else if chosen !== undefined}
  <VersionBadge version={chosen.version} badge={chosen.badge} unlisted={chosen.unlisted === true} />
{:else}
  <VersionBadge version={entry.version} badge={installed} />
{/if}
