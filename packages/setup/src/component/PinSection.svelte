<!--
  Pinning a package, or Foundry VTT, among the actions at the top of its panel: its toggle, for the version the plan has
  of it, or else the one installed, saying what it does (see `PinToggle`). It is a choice in every plan, not a lock in
  Foundry.
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { localize } from '../lib/i18n';

  import ActionItem from './ActionItem.svelte';
  import PinToggle from './PinToggle.svelte';

  interface Props {
    updates: UpdateState;
    /** The package's key, or `core`. */
    key: string;
    /** Its title. */
    title: string;
    /** The version to pin: the plan's, or else the installed one. */
    version: string;
  }

  let { updates, key, title, version }: Props = $props();
</script>

{#snippet button()}
  <PinToggle {updates} {key} {title} {version} labelled />
{/snippet}

{#snippet about()}
  <p>{localize('Pin.About')}</p>
{/snippet}

<ActionItem label={localize('Pin.Heading')} {button} {about} />
