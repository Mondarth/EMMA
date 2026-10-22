<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import { log } from '@module/lib/logger';
  import type { ProxyMode } from '@module/settings';
  import type { VersionProxyDraft } from '@module/state/version-proxy.svelte';

  interface Props {
    /** The choice, and the GM's own proxy and key, being set. */
    draft: VersionProxyDraft;
    /** Whether this build has EMMA's own proxy to offer. */
    hasDefault: boolean;
    /** Saves the choice, and the GM's own proxy and key, reporting its own problems to the user. */
    onSave: (mode: ProxyMode, proxy: string, key: string) => Promise<unknown>;
  }

  const { draft, hasDefault, onSave }: Props = $props();

  /** The choices offered, with the keys of their labels: EMMA's proxy only when this build has one. */
  const MODES: readonly { mode: ProxyMode; label: 'Default' | 'Own' | 'None' }[] = [
    { mode: 'default', label: 'Default' },
    { mode: 'own', label: 'Own' },
    { mode: 'none', label: 'None' },
  ];
  const offered = MODES.filter(({ mode }) => hasDefault || mode !== 'default');

  const uid = $props.id();

  let saving = $state(false);

  /**
   * Save the proxy and key, keeping Save disabled until saving finishes. Anything `onSave` throws is logged rather
   * than left unhandled.
   * @param event - The form's submission
   */
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving || !draft.valid) return;
    saving = true;
    try {
      await onSave(draft.mode, draft.proxy, draft.key);
    } catch (error) {
      log.error('Unable to save the version lookup proxy', error);
    } finally {
      saving = false;
    }
  }
</script>

<form class="emma-proxy" onsubmit={submit}>
  <fieldset class="emma-proxy-modes" role="radiogroup" aria-labelledby={`${uid}-choice`}>
    <legend id={`${uid}-choice`}>{localize('MONDARTH-EMMA.Settings.VersionProxy.Choice')}</legend>
    {#each offered as { mode, label } (mode)}
      <label class="emma-proxy-mode">
        <input
          type="radio"
          name={`${uid}-mode`}
          value={mode}
          checked={draft.mode === mode}
          aria-labelledby={`${uid}-${mode}-name`}
          aria-describedby={`${uid}-${mode}-hint`}
          onchange={() => {
            draft.mode = mode;
          }} />
        <span>
          <span id={`${uid}-${mode}-name`} class="emma-proxy-mode-name"
            >{localize(`MONDARTH-EMMA.Settings.VersionProxy.Modes.${label}`)}</span>
          <span id={`${uid}-${mode}-hint`} class="hint">
            {localize(`MONDARTH-EMMA.Settings.VersionProxy.Modes.${label}Hint`)}
          </span>
        </span>
      </label>
    {/each}
  </fieldset>

  {#if draft.mode === 'own'}
    <div class="form-group stacked">
      <label for={`${uid}-proxy`}>{localize('MONDARTH-EMMA.Settings.VersionProxy.Url')}</label>
      <input
        id={`${uid}-proxy`}
        type="text"
        placeholder={'https://proxy.example.com/?url={url}'}
        spellcheck="false"
        aria-invalid={!draft.valid}
        aria-describedby={`${uid}-proxy-hint`}
        bind:value={draft.proxy} />
      <p id={`${uid}-proxy-hint`} class="hint">{localize('MONDARTH-EMMA.Settings.VersionProxy.UrlHint')}</p>
      {#if !draft.valid}
        <p class="emma-proxy-invalid" role="alert">
          <i class="fa-solid fa-triangle-exclamation" inert></i>
          {localize('MONDARTH-EMMA.Settings.VersionProxy.Invalid')}
        </p>
      {/if}
    </div>

    <div class="form-group stacked">
      <label for={`${uid}-key`}>{localize('MONDARTH-EMMA.Settings.VersionProxy.Key')}</label>
      <input
        id={`${uid}-key`}
        type="password"
        autocomplete="off"
        spellcheck="false"
        aria-describedby={`${uid}-key-hint`}
        bind:value={draft.key} />
      <p id={`${uid}-key-hint`} class="hint">{localize('MONDARTH-EMMA.Settings.VersionProxy.KeyHint')}</p>
    </div>
  {/if}

  <footer class="form-footer">
    <button type="submit" disabled={saving || !draft.valid}>
      <i class="fa-solid fa-floppy-disk" inert></i>
      {localize('MONDARTH-EMMA.Settings.VersionProxy.Save')}
    </button>
  </footer>
</form>

<style>
  .emma-proxy {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: var(--font-body);
  }

  .emma-proxy-modes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .emma-proxy-modes legend {
    font-weight: bold;
  }

  .emma-proxy-mode {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .emma-proxy-mode > span {
    display: flex;
    flex-direction: column;
  }

  .emma-proxy-mode .hint {
    color: var(--color-text-secondary);
  }

  .emma-proxy-invalid {
    margin: 0;
    color: var(--color-level-error);
  }
</style>
