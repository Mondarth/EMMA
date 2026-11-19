<!--
  The extension's options page: the servers EMMA is active on, how it opens on each, and forgetting them; and the
  catalogue account EMMA asks the catalogue as.
-->
<script lang="ts">
  import { forget, setAuto } from '../browser/actions';
  import { t } from '../lib/i18n';
  import type { Site } from '../lib/sites';
  import Account from './Account.svelte';

  interface Props {
    sites: readonly Site[];
    /** The catalogue's URL, or `null` for a build without one. */
    catalogue?: string | null;
    /** Opens a page for the user: in a new tab, by default. */
    openPage?: (url: string) => void;
  }

  let {
    sites: initial,
    catalogue = null,
    openPage = url => {
      void chrome.tabs.create({ url });
    },
  }: Props = $props();

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
  {#if catalogue !== null}
    <Account {catalogue} {openPage} />
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
