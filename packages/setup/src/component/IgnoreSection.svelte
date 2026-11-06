<!--
  Ignoring a world, game system or module, below its panel: ignored, no plan takes it into account, as the EMMA
  module's hypothetical mode ignores a module (see `considered`). It takes effect at once, not in the plan.
-->
<script lang="ts">
  import type { Activity } from '../app/busy.svelte';
  import { format, localize } from '../lib/i18n';

  import BusyMark from './BusyMark.svelte';

  interface Props {
    /** Its title. */
    title: string;
    /** Whether it is a world, rather than a game system or module. */
    world?: boolean;
    /** Whether it is ignored. */
    ignored: boolean;
    /** Whether it cannot be ignored or stop being ignored now, as while the plan runs. */
    disabled: boolean;
    /** Ignore it, or stop ignoring it. */
    onIgnore: (ignore: boolean) => void;
    /** What EMMA is busy with because of this section's button, shown over it; nothing by default. */
    busy?: Activity | undefined;
  }

  let { title, world = false, ignored, disabled, onIgnore, busy }: Props = $props();
  const said = $derived(
    ignored ? (world ? 'Ignore.IgnoredWorld' : 'Ignore.Ignored') : world ? 'Ignore.UnignoredWorld' : 'Ignore.Unignored',
  );

  const uid = $props.id();
</script>

<section class="emma-ignore" aria-labelledby="{uid}-heading">
  <h3 id="{uid}-heading">{localize('Ignore.Heading')}</h3>
  <p>{format(said, { title })}</p>
  <button
    type="button"
    class="emma-busy-host"
    aria-busy={busy !== undefined}
    disabled={disabled || busy !== undefined}
    onclick={() => {
      onIgnore(!ignored);
    }}>
    <i class={['fa-solid', ignored ? 'fa-eye' : 'fa-eye-slash']} aria-hidden="true"></i>
    {format(ignored ? 'Ignore.Unignore' : 'Ignore.Ignore', { title })}
    <BusyMark activity={busy} />
  </button>
</section>

<style>
  .emma-ignore {
    margin-top: 1rem;
  }

  .emma-ignore button {
    width: auto;
  }
</style>
