<!--
  The extension's popup, for the tab the user is on: activate EMMA on its server, open it just this once, or change
  how it opens there.
-->
<script lang="ts">
  import type { Tab } from '../browser/actions';
  import { activate, forget, openOnce, setAuto } from '../browser/actions';
  import { t } from '../lib/i18n';
  import type { Site } from '../lib/sites';
  import { isSetupPage, originOf } from '../lib/sites';

  interface Props {
    tab: Tab;
    sites: readonly Site[];
    /** Opens the options page. */
    onManage: () => void;
    /** Closes the popup, once EMMA has been brought into the page. */
    onDone: () => void;
  }

  let { tab, sites: initial, onManage, onDone }: Props = $props();

  // svelte-ignore state_referenced_locally
  let sites = $state<readonly Site[]>(initial);
  let message = $state<string>();
  let busy = $state(false);

  const server = $derived(originOf(tab.url));
  const site = $derived(sites.find(entry => entry.origin === server));
  const onSetup = $derived(isSetupPage(tab.url));

  /**
   * Run an action, keeping the buttons disabled while it does.
   * @param action - The action
   */
  async function run(action: () => Promise<void>): Promise<void> {
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }
</script>

<main class="emma-popup">
  <h1>{t('popupTitle')}</h1>
  <p class="emma-alpha">{t('alpha')}</p>

  {#if server === undefined}
    <p>{t('notAServer')}</p>
  {:else}
    <p class="emma-server">{t('server', server)}</p>
    {#if !onSetup}
      <p class="emma-note">{t('notSetup')}</p>
    {/if}

    {#if site === undefined}
      <p>{t('consent')}</p>
      <div class="emma-actions">
        <button
          type="button"
          disabled={busy}
          onclick={() =>
            run(async () => {
              const result = await activate(tab);
              if (result === 'activated') {
                if (onSetup) onDone();
                else message = t('activated');
              } else message = t('refused');
            })}>{t('activate')}</button>
        <button
          type="button"
          disabled={busy || !onSetup}
          onclick={() =>
            run(async () => {
              if (await openOnce(tab)) onDone();
            })}>{t('once')}</button>
      </div>
    {:else}
      <p>{t('activated')}</p>
      <label>
        <input
          type="checkbox"
          checked={site.auto}
          disabled={busy}
          onchange={event => {
            const auto = event.currentTarget.checked;
            void run(async () => {
              sites = await setAuto(site.origin, auto);
            });
          }} />
        {t('auto')}
      </label>
      <div class="emma-actions">
        <button
          type="button"
          disabled={busy || !onSetup}
          onclick={() =>
            run(async () => {
              if (await openOnce(tab)) onDone();
            })}>{t('openNow')}</button>
        <button
          type="button"
          disabled={busy}
          onclick={() =>
            run(async () => {
              sites = await forget(site.origin);
            })}>{t('forget')}</button>
      </div>
    {/if}
    {#if message !== undefined}
      <p role="status">{message}</p>
    {/if}
  {/if}

  <button type="button" class="emma-link" onclick={onManage}>{t('manage')}</button>
</main>

<style>
  .emma-popup {
    width: 22rem;
    padding: 0.75rem;
    font:
      14px/1.4 system-ui,
      sans-serif;
  }

  h1 {
    margin: 0;
    font-size: 1.1rem;
  }

  .emma-alpha,
  .emma-note {
    color: #8a5a00;
  }

  .emma-server {
    font-family: monospace;
    word-break: break-all;
  }

  .emma-actions {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .emma-link {
    margin-top: 0.5rem;
    padding: 0;
    border: none;
    background: none;
    color: #0060df;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
