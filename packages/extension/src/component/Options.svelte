<!--
  The extension's options page: the servers EMMA is active on, how it opens on each, and forgetting them.
-->
<script lang="ts">
  import { forget, setAuto } from '../browser/actions';
  import { t } from '../lib/i18n';
  import type { Site } from '../lib/sites';

  interface Props {
    sites: readonly Site[];
  }

  let { sites: initial }: Props = $props();

  // svelte-ignore state_referenced_locally
  let sites = $state<readonly Site[]>(initial);
</script>

<main class="emma-options">
  <h1>{t('optionsTitle')}</h1>
  <p>{t('optionsIntro')}</p>
  {#if sites.length === 0}
    <p>{t('noSites')}</p>
  {:else}
    <ul>
      {#each sites as site (site.origin)}
        <li>
          <span class="emma-server">{site.origin}</span>
          <label>
            <input
              type="checkbox"
              checked={site.auto}
              aria-label={t('autoFor', site.origin)}
              onchange={async event => {
                sites = await setAuto(site.origin, event.currentTarget.checked);
              }} />
            {t('auto')}
          </label>
          <button
            type="button"
            aria-label={t('forgetSite', site.origin)}
            onclick={async () => {
              sites = await forget(site.origin);
            }}>{t('forget')}</button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .emma-options {
    max-width: 40rem;
    font:
      14px/1.4 system-ui,
      sans-serif;
  }

  ul {
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #ccc;
  }

  .emma-server {
    flex: 1 1 100%;
    font-family: monospace;
  }
</style>
