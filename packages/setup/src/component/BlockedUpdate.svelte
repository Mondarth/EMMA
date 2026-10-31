<!--
  Why EMMA does not offer a package's newest version, in the panel for the package: the version, and each world that
  holds it back, saying why.
-->
<script lang="ts">
  import { format, localize } from '../lib/i18n';
  import type { BlockedUpdate, UpdateHold } from '../lib/updates';

  interface Props {
    blocked: BlockedUpdate;
  }

  let { blocked }: Props = $props();

  const HELD: Readonly<Record<UpdateHold['reason'], string>> = {
    unrecorded: 'Update.HeldUnrecorded',
    unresolved: 'Update.HeldUnresolved',
    inconsistent: 'Update.HeldInconsistent',
  };
</script>

<section class="emma-blocked" aria-labelledby="emma-setup-blocked">
  <h3 id="emma-setup-blocked">
    <i class="fa-solid fa-circle-up" aria-hidden="true"></i>
    {format('Update.BlockedTitle', { version: blocked.newest })}
  </h3>
  <p>{localize('Update.BlockedWhy')}</p>
  {#if blocked.needsCore !== undefined}
    <p>{format('Update.NeedsCore', { core: blocked.needsCore })}</p>
  {/if}
  {#if blocked.holds.length > 0}
    <ul>
      {#each blocked.holds as hold (hold.world.id)}
        <li>{format(HELD[hold.reason], { world: hold.world.title })}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .emma-blocked h3 i {
    color: var(--color-level-error, #e55);
  }
</style>
