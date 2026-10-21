<script lang="ts">
  import { localize } from '@module/lib/i18n';
  import { log } from '@module/lib/logger';
  import type { VersionProxyDraft } from '@module/state/version-proxy.svelte';

  interface Props {
    /** The proxy and key being set. */
    draft: VersionProxyDraft;
    /** Saves the proxy and key, reporting its own problems to the user. */
    onSave: (proxy: string, key: string) => Promise<unknown>;
  }

  const { draft, onSave }: Props = $props();

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
      await onSave(draft.proxy, draft.key);
    } catch (error) {
      log.error('Unable to save the version lookup proxy', error);
    } finally {
      saving = false;
    }
  }
</script>

<form class="emma-proxy" onsubmit={submit}>
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

  .emma-proxy-invalid {
    margin: 0;
    color: var(--color-level-error);
  }
</style>
