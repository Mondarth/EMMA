<!--
  Installing game systems or modules anew, below the panel of the Game systems or Modules group: those on Foundry's
  listing that fit the installation and the plan (see lib/install.ts), found by a search and narrowed by filters, each
  to add to the plan, with a drawer of what the listing says of it. The plan takes the newest version that fits with its
  other choices, looking its releases up first, or says why none does.
-->
<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';

  import type { ListingState } from '../app/setup-state.svelte';
  import type { InstallResult, UpdateState } from '../app/update-state.svelte';
  import type { ListedPackage } from '../foundry/setup-game';
  import { format, localize } from '../lib/i18n';
  import type { InstallFilters } from '../lib/install';
  import { compatibilityText, matching, tagsAmong, tagText, toggleTag, UNTAGGED, withTags } from '../lib/install';

  interface Props {
    type: 'module' | 'system';
    /** Foundry's listing, as far as it is read. */
    listing: ListingState;
    /** The packages on it that fit, as the filters narrow them. */
    packages: readonly ListedPackage[];
    /** How the user narrows them. */
    filters: InstallFilters;
    updates: UpdateState;
    /** Read Foundry's listing of the type, once shown. */
    onShow: (type: 'module' | 'system') => void;
    /** Change the filters. */
    onFilter: (change: Partial<InstallFilters>) => void;
  }

  let { type, listing, packages, filters, updates, onShow, onFilter }: Props = $props();
  const plural = $derived(type === 'system' ? 'Systems' : 'Modules');
  $effect(() => {
    onShow(type);
  });

  /** How many more packages are shown each time the end of the list comes into view. */
  const BATCH = 25;

  const uid = $props.id();
  let query = $state('');
  /** How adding each package went, by its key, while it is added or once it could not be. */
  const added = new SvelteMap<string, 'adding' | Exclude<InstallResult, { ok: true }>>();
  /** The tags among the modules, each a badge to turn on or off; game systems have none. */
  const tags = $derived(type === 'module' ? tagsAmong(packages) : []);
  const found = $derived(matching(withTags(packages, filters.offTags), query));
  /** How many of those are shown: a batch, and another each time the end of the list comes into view. */
  let shown = $state(BATCH);
  /** Just past the last package shown, while more are found. */
  let end = $state<HTMLElement | null>(null);

  // Shows another batch while the end of the list is in view, until the panel is filled, then as it is scrolled down.
  // An observer reports whether its target is in view when it starts, so one is started for each batch: the end may
  // still be in view after one is shown.
  $effect(() => {
    if (end === null) return;
    const batch = shown;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(({ isIntersecting }) => isIntersecting)) shown = batch + BATCH;
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(end);
    return () => {
      observer.disconnect();
    };
  });

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
          shown = BATCH;
        }} />
    </label>
    <fieldset class="emma-install-filters">
      <legend>{localize('Install.Filters')}</legend>
      <label>
        <input
          type="checkbox"
          checked={filters.hideBehind}
          onchange={event => {
            onFilter({ hideBehind: event.currentTarget.checked });
            shown = BATCH;
          }} />
        {localize(`Install.HideBehind${plural}`)}
      </label>
      <label>
        <input
          type="checkbox"
          checked={filters.showUnowned}
          onchange={event => {
            onFilter({ showUnowned: event.currentTarget.checked });
            shown = BATCH;
          }} />
        {localize(`Install.ShowUnowned${plural}`)}
      </label>
      {#if tags.length > 0}
        <div class="emma-install-tags" role="group" aria-label={localize('Install.Tags')}>
          {#each tags as tag (tag)}
            {@const on = !filters.offTags.includes(tag)}
            <button
              type="button"
              class={['emma-install-tag', { 'emma-install-tag-on': on }]}
              aria-pressed={on}
              onclick={event => {
                onFilter({ offTags: toggleTag(tags, filters.offTags, tag, event.shiftKey) });
                shown = BATCH;
              }}>
              <i class={['fa-solid', on ? 'fa-check' : 'fa-xmark']} aria-hidden="true"></i>
              {tag === UNTAGGED ? localize('Install.Untagged') : tagText(tag)}
            </button>
          {/each}
        </div>
        <p class="emma-install-hint">{localize('Install.TagsHint')}</p>
      {/if}
    </fieldset>
    <p role="status">
      {format('Install.Shown', { shown: String(Math.min(found.length, shown)), count: String(found.length) })}
    </p>
    <ul>
      {#each found.slice(0, shown) as pkg (pkg.id)}
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
          {:else if pkg.unowned}
            <span class="emma-install-unowned">
              <i class="fa-solid fa-lock" aria-hidden="true"></i>
              {localize('Install.Unowned')}
            </span>
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
          <details class="emma-install-details">
            <summary>{format('Install.Details', { title: pkg.title })}</summary>
            <dl>
              {#if pkg.description !== undefined}
                <dt>{localize('Install.Description')}</dt>
                <dd>{pkg.description}</dd>
              {/if}
              {#if pkg.authors !== undefined}
                <dt>{localize('Install.Authors')}</dt>
                <dd>{pkg.authors.join(', ')}</dd>
              {/if}
              <dt>{localize('Install.Version')}</dt>
              <dd>{pkg.version}</dd>
              <dt>{localize('Install.Compatibility')}</dt>
              <dd>{compatibilityText(pkg.compatibility)}</dd>
              {#if pkg.type === 'module'}
                <dt>{localize('Install.ForSystems')}</dt>
                <dd>{pkg.systems.length === 0 ? localize('Install.AnySystem') : pkg.systems.join(', ')}</dd>
              {/if}
              {#if pkg.tags !== undefined}
                <dt>{localize('Install.Tags')}</dt>
                <dd>{pkg.tags.map(tagText).join(', ')}</dd>
              {/if}
              {#if pkg.premium || pkg.exclusive}
                <dt>{localize('Install.Content')}</dt>
                <dd>
                  {localize(
                    pkg.premium ? (pkg.unowned ? 'Install.PremiumUnowned' : 'Install.Premium') : 'Install.Exclusive',
                  )}
                </dd>
              {/if}
              {#if pkg.url !== undefined}
                <dt>{localize('Install.WebPage')}</dt>
                <dd><a href={pkg.url} target="_blank" rel="noopener noreferrer">{pkg.url}</a></dd>
              {/if}
            </dl>
          </details>
        </li>
      {/each}
    </ul>
    {#if found.length > shown}
      <div class="emma-install-end" bind:this={end}></div>
    {/if}
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

  .emma-install-filters {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.5rem 0;
  }

  .emma-install-filters label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .emma-install-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  /* On or off shows by the mark and the border as well as by the colour. */
  .emma-install .emma-install-tag {
    flex: 0 0 auto;
    padding: 0 0.5rem;
    line-height: 1.6;
    border: 1px dashed var(--color-border, #777);
    border-radius: 1rem;
    background: transparent;
    font-size: 0.85em;
  }

  .emma-install .emma-install-tag-on {
    border-style: solid;
    background: var(--color-warm-2, rgba(255, 100, 0, 0.25));
  }

  .emma-install-unowned {
    font-size: 0.85em;
    opacity: 0.8;
  }

  .emma-install-details summary {
    cursor: pointer;
    font-size: 0.85em;
  }

  .emma-install-details dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0.25rem 0 0.5rem 1rem;
  }

  .emma-install-details dt {
    font-weight: bold;
  }

  .emma-install-details dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .emma-install-end {
    height: 1px;
  }

  .emma-install button {
    width: auto;
  }
</style>
