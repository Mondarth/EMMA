<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import type { ModuleState } from '@module/state/module-state.svelte';

  interface Props {
    /** The modules and their selection. */
    modules: ModuleState;
  }

  const { modules }: Props = $props();

  const deactivate = localize('MONDARTH-EMMA.Split.Deactivate');
  const activate = localize('MONDARTH-EMMA.Split.Activate');
</script>

<div class="emma-transfer">
  <button
    type="button"
    class="icon fa-solid fa-angle-left"
    aria-label={deactivate}
    data-tooltip={deactivate}
    disabled={modules.selected('active').size === 0}
    onclick={() => {
      modules.deactivateSelected();
    }}></button>
  <button
    type="button"
    class="icon fa-solid fa-angle-right"
    aria-label={activate}
    data-tooltip={activate}
    disabled={modules.selected('inactive').size === 0}
    onclick={() => {
      modules.activateSelected();
    }}></button>
</div>

<style>
  .emma-transfer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
