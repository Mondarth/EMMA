<!--
  The options page's catalogue account: signing the user in at Mondarth's accounts, by approving this browser on the
  accounts' page (the device flow), whom the catalogue takes it to be signed in as, their subscription, and signing out.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';

  import type { DeviceCodes, Me, SignInEnd } from '../browser/catalogue';
  import { forgetToken, readMe, signIn } from '../browser/catalogue';
  import { t } from '../lib/i18n';

  interface Props {
    /** The catalogue's URL, which says whom the token is for. */
    catalogue: string;
    /** The accounts' URL, where the user signs in and finds their profile and subscription; the catalogue's without. */
    accounts?: string | null;
    /** Opens a page for the user, in a new tab. */
    openPage: (url: string) => void;
    /** How the extension asks the catalogue, as a test gives its own. */
    fetch?: typeof globalThis.fetch;
  }

  let { catalogue, accounts = null, openPage, fetch: send = globalThis.fetch.bind(globalThis) }: Props = $props();

  /** Where the user signs in, and finds their profile and subscription. */
  const site = $derived(accounts ?? catalogue);

  let me = $state<Me | null>(null);
  let codes = $state<DeviceCodes | null>(null);
  let ended = $state<Exclude<SignInEnd, 'approved' | 'cancelled'> | null>(null);
  let signingIn = $state(false);
  let controller: AbortController | undefined;

  /**
   * The accounts' page by its path.
   * @param path - The path
   * @returns The page's address
   */
  function page(path: string): string {
    return new URL(path, site).href;
  }

  /**
   * A day, as the browser writes one.
   * @param iso - The time, in ISO 8601
   * @returns The day
   */
  function day(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }

  /** What is said of the user signed in: whom, and their subscription, which needs renewing if it ended. */
  const signedIn = $derived.by(() => {
    if (me?.state !== 'signed-in') return null;
    const { handle, entitled, paidUntil } = me;
    let subscription: string;
    if (entitled)
      subscription = paidUntil === null ? t('accountEntitled') : t('accountSubscribedUntil', day(paidUntil));
    else subscription = paidUntil === null ? t('accountNotSubscribed') : t('accountLapsed', day(paidUntil));
    return { who: t('accountSignedInAs', handle), subscription, renew: !entitled };
  });

  /** Read whom the extension is signed in as. */
  async function refresh(): Promise<void> {
    me = null;
    me = await readMe(catalogue, send);
  }

  /** Sign the user in, showing the code until they approve this browser, deny it, or cancel. */
  async function start(): Promise<void> {
    controller = new AbortController();
    signingIn = true;
    ended = null;
    const end = await signIn(site, {
      onCodes: given => {
        codes = given;
      },
      openPage,
      signal: controller.signal,
      fetch: send,
    });
    signingIn = false;
    codes = null;
    if (end === 'approved') await refresh();
    else if (end !== 'cancelled') ended = end;
  }

  /** Forget the user's token. */
  async function signOut(): Promise<void> {
    await forgetToken();
    me = { state: 'signed-out' };
  }

  onDestroy(() => controller?.abort());
  void refresh();
</script>

<section class="emma-account" aria-labelledby="emma-account-heading">
  <h2 id="emma-account-heading">{t('accountTitle')}</h2>
  <p>{t('accountIntro')}</p>
  {#if signingIn}
    <div role="status">
      {#if codes === null}
        <p>{t('accountAsking')}</p>
      {:else}
        <p>{t('accountCode')}</p>
        <p class="emma-code">{codes.userCode}</p>
        <p>
          <a href={codes.verificationUri} target="_blank" rel="noopener noreferrer">{t('accountApprovePage')}</a>
        </p>
      {/if}
    </div>
    <button
      type="button"
      onclick={() => {
        controller?.abort();
      }}>{t('accountCancel')}</button>
  {:else if me === null}
    <p role="status">{t('accountReading')}</p>
  {:else if signedIn !== null}
    <p>{signedIn.who}</p>
    {#if signedIn.renew}
      <p role="alert">{signedIn.subscription}</p>
      <p>
        <a href={page('/subscription')} target="_blank" rel="noopener noreferrer">{t('accountRenew')}</a>
      </p>
    {:else}
      <p>{signedIn.subscription}</p>
    {/if}
    <button type="button" onclick={() => void signOut()}>{t('accountSignOut')}</button>
    <p class="emma-hint">
      {t('accountSignOutHint')}
      <a href={page('/profile')} target="_blank" rel="noopener noreferrer">{t('accountDevices')}</a>
    </p>
  {:else if me.state === 'unreachable'}
    <p role="alert">{t('accountUnreachable')}</p>
    <button type="button" onclick={() => void refresh()}>{t('accountRetry')}</button>
  {:else if me.state === 'signed-out'}
    {#if ended !== null}
      <p role="alert">{t(`accountEnded_${ended}`)}</p>
    {/if}
    <button type="button" onclick={() => void start()}>{t('accountSignIn')}</button>
  {/if}
</section>

<style>
  .emma-account {
    margin-top: 1.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #ccc;
  }

  .emma-code {
    font-family: monospace;
    font-size: 1.5rem;
    letter-spacing: 0.15em;
  }

  .emma-hint {
    color: #555;
  }
</style>
