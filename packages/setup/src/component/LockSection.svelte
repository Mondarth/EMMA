<!--
  Locking a game system or module in Foundry, below its panel, as Foundry's own package menu does: a locked package is
  kept as it is installed, as Foundry refuses to update or uninstall it, so EMMA's plan never changes it either. It
  takes effect at once, not in the plan.
-->
<script lang="ts">
  import { format, localize } from '../lib/i18n';

  interface Props {
    /** The package's title. */
    title: string;
    /** Its installed version. */
    version: string;
    /** Whether it is locked. */
    locked: boolean;
    /** Whether it cannot be locked or unlocked now, as while the plan runs. */
    disabled: boolean;
    /** Lock it, or unlock it. */
    onLock: (lock: boolean) => void;
  }

  let { title, version, locked, disabled, onLock }: Props = $props();

  const uid = $props.id();
</script>

<section class="emma-lock" aria-labelledby="{uid}-heading">
  <h3 id="{uid}-heading">{localize('Lock.Heading')}</h3>
  <p>{format(locked ? 'Lock.Locked' : 'Lock.Unlocked', { title, version })}</p>
  <button
    type="button"
    {disabled}
    onclick={() => {
      onLock(!locked);
    }}>
    <i class={['fa-solid', locked ? 'fa-unlock' : 'fa-lock']} aria-hidden="true"></i>
    {format(locked ? 'Lock.Unlock' : 'Lock.Lock', { title, version })}
  </button>
</section>

<style>
  .emma-lock {
    margin-top: 1rem;
  }

  .emma-lock button {
    width: auto;
  }
</style>
