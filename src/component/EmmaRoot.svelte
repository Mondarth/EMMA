<script lang="ts">
  import { localize } from '@module/lib/i18n';
</script>

<div class="emma-root">
  <p class="emma-placeholder">{localize('MONDARTH-EMMA.App.Placeholder')}</p>
</div>

<style>
  .emma-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: var(--font-body);
  }

  .emma-placeholder {
    margin: auto;
    color: var(--color-text-secondary);
  }
</style>
