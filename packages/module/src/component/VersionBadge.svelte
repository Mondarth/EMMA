<script lang="ts">
  import type { VersionBadge } from '@module/adapters/modules';
  import { localize } from '@module/lib/i18n';

  interface Props {
    /** The module's version. */
    version: string;
    /** Its compatibility badge, or `null` to show the version alone. */
    badge: VersionBadge | null;
    /** Whether the version is not on Foundry's package listing; the badge's tooltip and text say so already. */
    unlisted?: boolean;
  }

  const { version, badge, unlisted = false }: Props = $props();
</script>

<!-- A version not on Foundry's package listing carries a flask, as work not yet released there. -->
{#snippet unlistedMark()}
  {#if unlisted}<i class="fa-solid fa-flask fa-fw emma-unlisted" inert></i>{/if}
{/snippet}

{#if badge === null}
  <span class="emma-version" data-tooltip={unlisted ? localize('MONDARTH-EMMA.Versions.Unlisted') : undefined}
    >{version}{@render unlistedMark()}{#if unlisted}<span class="emma-badge-text"
        >{localize('MONDARTH-EMMA.Versions.Unlisted')}</span
      >{/if}</span>
{:else}
  <span class={['emma-version', 'emma-badge', badge.type]} data-tooltip-html={badge.tooltip}>
    <i class={[badge.icon, 'fa-fw']} inert></i>
    {version}
    {@render unlistedMark()}
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
