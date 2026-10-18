<script lang="ts">
  import type { VersionBadge } from '@module/adapters/modules';

  interface Props {
    /** The module's version. */
    version: string;
    /** Its compatibility badge, or `null` to show the version alone. */
    badge: VersionBadge | null;
  }

  const { version, badge }: Props = $props();
</script>

{#if badge === null}
  <span class="emma-version">{version}</span>
{:else}
  <span class={['emma-version', 'emma-badge', badge.type]} data-tooltip-html={badge.tooltip}>
    <i class={[badge.icon, 'fa-fw']} inert></i>
    {version}
    <span class="emma-badge-text">{badge.text}</span>
  </span>
{/if}

<style>
  /* Foundry's own badge styles only apply inside its package lists, so these follow them with the same variables. */
  .emma-version {
    flex: none;
    font-size: var(--font-size-12);
    white-space: nowrap;
  }

  .emma-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 1.25rem;
    padding: 0 0.25rem;
    border: 1px solid var(--color-cool-3);
    border-radius: 2px;
    background: var(--color-cool-4);
    color: var(--color-light-1);
    text-shadow: 1px 1px var(--color-dark-2);
  }

  .emma-badge.neutral {
    background: var(--color-dark-3);
    border-color: var(--color-dark-5);
  }

  .emma-badge.warning {
    background: var(--color-level-warning-bg);
    border-color: var(--color-level-warning-border);
  }

  .emma-badge.error {
    background: var(--color-level-error-bg);
    border-color: var(--color-level-error-border);
  }

  .emma-badge.success {
    background: var(--color-level-success-bg);
    border-color: var(--color-level-success-border);
  }

  /* Read by screen readers, which do not see the tooltip, but not shown. */
  .emma-badge-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
