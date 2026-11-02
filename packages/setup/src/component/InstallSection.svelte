<!--
  Installing game systems or modules anew, below the panel of the Game systems or Modules group: those on Foundry's
  listing that fit the installation and the plan (see lib/install.ts), found by a search, each to add to the plan. The
  plan takes the newest version that fits with its other choices, looking its releases up first, or says why none does.
-->
<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';

  import type { ListingState } from '../app/setup-state.svelte';
  import type { InstallResult, UpdateState } from '../app/update-state.svelte';
  import type { ListedPackage } from '../foundry/setup-game';
  import { format, localize } from '../lib/i18n';
  import { matching } from '../lib/install';

  interface Props {
    type: 'module' | 'system';
    /** Foundry's listing, as far as it is read. */
    listing: ListingState;
    /** The packages on it that fit. */
    packages: readonly ListedPackage[];
    updates: UpdateState;
    /** Read Foundry's listing of the type, once shown. */
    onShow: (type: 'module' | 'system') => void;
  }

  let { type, listing, packages, updates, onShow }: Props = $props();
  $effect(() => {
    onShow(type);
  });

  /** The most packages shown at once. */
  const SHOWN = 25;

  const uid = $props.id();
  let query = $state('');
  /** How adding each package went, by its key, while it is added or once it could not be. */
  const added = new SvelteMap<string, 'adding' | Exclude<InstallResult, { ok: true }>>();
  const found = $derived(matching(packages, query));

  /**
   * Add a package to the plan.
   * @param key - The package's key
   * @param title - Its title
   */
  async function add(key: string, title: string): Promise<void> {
    added.set(key, 'adding');
    const result = await updates.install(key, title);
    if (result.ok) added.delete(key);
    else added.set(key, result);
  }
</script>

<section class="emma-install" aria-labelledby="{uid}-heading">
  <h3 id="{uid}-heading">{localize(type === 'system' ? 'Install.Systems' : 'Install.Modules')}</h3>
  {#if listing === null || listing === 'loading'}
    <p>{localize('Install.Reading')}</p>
  {:else if listing === 'failed'}
    <p class="emma-install-failed">{localize('Install.ReadFailed')}</p>
  {:else}
    <p class="emma-install-hint">{localize('Install.Hint')}</p>
    <label>
      {localize('Install.Search')}
      <input
        type="search"
        value={query}
        oninput={event => {
          query = event.currentTarget.value;
        }} />
    </label>
    <p role="status">
      {format('Install.Shown', { shown: String(Math.min(found.length, SHOWN)), count: String(found.length) })}
    </p>
    <ul>
      {#each found.slice(0, SHOWN) as pkg (pkg.id)}
        {@const key = `${pkg.type}:${pkg.id}`}
        {@const planned = updates.chosenOf(key)}
        {@const state = added.get(key)}
        <li>
          <span class="emma-install-title">{pkg.title}</span>
          {#if pkg.author !== undefined}
            <span class="emma-install-author">{format('Install.By', { author: pkg.author })}</span>
          {/if}
          <span class="emma-install-version">{format('Install.Newest', { version: pkg.version })}</span>
          {#if planned !== undefined}
            <span>{format('Install.Planned', { version: planned })}</span>
            <button
              type="button"
              disabled={updates.locked}
              onclick={() => {
                void updates.forget(key);
              }}>{format('Install.TakeOut', { title: pkg.title })}</button>
          {:else}
            <button
              type="button"
              disabled={updates.locked || state === 'adding'}
              onclick={() => {
                void add(key, pkg.title);
              }}>
              {state === 'adding' ? localize('Install.Adding') : format('Install.Add', { title: pkg.title })}
            </button>
          {/if}
          {#if typeof state === 'object'}
            <p class="emma-install-failed">{state.reason}</p>
            {#if state.explanation !== undefined}
              <ul>
                {#each state.explanation as line, index (index)}
                  <li>{line}</li>
                {/each}
              </ul>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .emma-install {
    margin-top: 1rem;
  }

  .emma-install ul {
    padding-left: 1rem;
  }

  .emma-install li {
    margin: 0.25rem 0;
  }

  .emma-install-title {
    font-weight: bold;
  }

  .emma-install-author,
  .emma-install-version,
  .emma-install-hint {
    font-size: 0.85em;
    opacity: 0.8;
  }

  .emma-install-failed {
    color: var(--color-level-error, #c00);
  }

  .emma-install button {
    width: auto;
  }
</style>
