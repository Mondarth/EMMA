<!--
  Installing game systems or modules anew, below the panel of the Game systems or Modules group: those on Foundry's
  listing that fit the installation and the plan (see lib/install.ts), found by a search and narrowed by filters, each
  to add to the plan, with a drawer of what the listing says of it. The plan takes the newest version that fits with its
  other choices, looking its releases up first, or says why none does.
-->
<script lang="ts">
  import type { PackageKey } from '@mondarth/fvtt-resolver';
  import { SvelteMap } from 'svelte/reactivity';

  import type { ListingState } from '../app/setup-state.svelte';
  import type { InstallResult, ManifestResult, UpdateState } from '../app/update-state.svelte';
  import type { ListedPackage } from '../foundry/setup-game';
  import { format, localize, takesAn } from '../lib/i18n';
  import type { InstallFilters } from '../lib/install';
  import { compatibilityText, matching, tagsAmong, tagText, toggleTag, UNTAGGED, withTags } from '../lib/install';

  import BusyMark from './BusyMark.svelte';

  interface Props {
    type: 'module' | 'system';
    /** Foundry's listing, as far as it is read. */
    listing: ListingState;
    /** What the modules offered are for, as the heading names it: `Universal`, or a game system's title. */
    scope?: string | undefined;
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

  let { type, listing, scope, packages, filters, updates, onShow, onFilter }: Props = $props();
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

  type Relations = NonNullable<Awaited<ReturnType<UpdateState['relationsOf']>>>;
  /** What each package opened requires and recommends, by its ID, as its manifest says, once read or while it is. */
  const relations = new SvelteMap<string, 'reading' | 'unreadable' | Relations>();
  /** The titles of the packages listed, by key, to name what one requires and recommends by. */
  const titles = $derived(
    new Map<string, string>(
      (Array.isArray(listing) ? listing : []).map(({ type: kind, id, title }) => [`${kind}:${id}`, title]),
    ),
  );

  /**
   * Read what a package requires and recommends from its manifest, once, as its drawer opens.
   * @param pkg - The package
   */
  async function readRelations(pkg: ListedPackage): Promise<void> {
    const { manifest } = pkg;
    if (manifest === undefined || relations.has(pkg.id)) return;
    relations.set(pkg.id, 'reading');
    relations.set(pkg.id, (await updates.relationsOf(manifest, pkg.type)) ?? 'unreadable');
  }

  /**
   * A module's name, as the listing or the installation gives it.
   * @param key - The module's key
   * @returns Its title, or else its ID
   */
  function nameOf(key: PackageKey): string {
    const title = titles.get(key) ?? updates.titleOf(key);
    return title === key ? key.slice(key.indexOf(':') + 1) : title;
  }

  /**
   * Some modules, by name.
   * @param keys - The modules' keys
   * @returns The keys, sorted by name
   */
  const byName = (keys: readonly PackageKey[]): PackageKey[] =>
    [...keys].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  /** The manifest URL the user is giving. */
  let manifestUrl = $state('');
  /** How adding from it went, while it is read or once it has been. */
  let fromUrl = $state<'reading' | ManifestResult | null>(null);
  /** What the user added of this type against EMMA's advice. */
  const forced = $derived(updates.forced.filter(({ key }) => key.startsWith(`${type}:`)));

  /** Add the package the manifest URL gives to the plan, if the plan can take it. */
  async function addFromUrl(): Promise<void> {
    fromUrl = 'reading';
    const url = manifestUrl.trim();
    fromUrl = await updates.busy.run(`manifest:${type}`, 'reading', () => updates.installFrom(url, type));
    if (fromUrl.ok) manifestUrl = '';
  }

  /**
   * Add a package the plan cannot take anyway, against EMMA's advice.
   * @param result - Why the plan cannot take it, with the install to add
   */
  function override(result: Extract<ManifestResult, { ok: false }>): void {
    if (result.override !== undefined && updates.force(result.override)) {
      fromUrl = null;
      manifestUrl = '';
    }
  }

  /**
   * Add a package to the plan, or take it out, as its checkbox is ticked or not. The box shows what the plan has, so it
   * goes back until the plan changes, and stays as it was if the plan cannot.
   * @param box - The package's checkbox
   * @param key - The package's key
   * @param pkg - The package, as Foundry's listing gives it
   */
  async function choose(box: HTMLInputElement, key: string, pkg: ListedPackage): Promise<void> {
    const adding = box.checked;
    box.checked = !adding;
    if (!adding) {
      added.delete(key);
      await updates.busy.run(`install:${key}`, 'planning', () => updates.forget(key));
      return;
    }
    added.set(key, 'adding');
    const result = await updates.busy.run(`install:${key}`, 'planning', () =>
      updates.install(key, pkg.title, pkg.manifest),
    );
    if (result.ok) added.delete(key);
    else added.set(key, result);
  }
</script>

{#snippet relationsOf(pkg: ListedPackage)}
  {@const key = `${pkg.type}:${pkg.id}`}
  {@const read = relations.get(pkg.id)}
  {#if read === 'reading'}
    <p class="emma-install-hint">{localize('Relations.Reading')}</p>
  {:else if read === 'unreadable'}
    <p class="emma-install-hint">{localize('Relations.Unreadable')}</p>
  {:else if read !== undefined}
    {#if read.requires.length > 0}
      <h4>{localize('Relations.Requires')}</h4>
      <ul class="emma-install-relations">
        {#each byName(read.requires) as required (required)}
          <li>
            {nameOf(required)}
            <span class="emma-install-hint">
              {localize(updates.isInstalled(required) ? 'Module.same' : 'Relations.ComesWith')}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if read.recommends.length > 0}
      <h4>{localize('Recommends.Heading')}</h4>
      <ul class="emma-install-relations">
        {#each byName(read.recommends.map(({ key: recommended }) => recommended)) as recommended (recommended)}
          {@const why = updates.rejectionOf(key, recommended)}
          <li>
            <label>
              <input
                type="checkbox"
                checked={updates.isInstalled(recommended) || updates.wants(key, recommended)}
                disabled={updates.locked || updates.isInstalled(recommended)}
                aria-label={format('Recommends.Want', { title: nameOf(recommended), by: pkg.title })}
                onchange={event => {
                  const wanted = event.currentTarget.checked;
                  void updates.busy.run(`install:${key}`, 'planning', () =>
                    updates.setRecommended(key, recommended, wanted),
                  );
                }} />
              {nameOf(recommended)}
            </label>
            <span class="emma-install-hint">
              {localize(updates.isInstalled(recommended) ? 'Module.same' : 'Module.missing')}
            </span>
            {#if why !== undefined}
              <div class="emma-install-failed">
                <p>{format('Recommends.Rejected', { reason: why.reason })}</p>
                {#if why.explanation !== undefined}
                  <ul>
                    {#each why.explanation as line, index (index)}
                      <li>{line}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if read.requires.length === 0 && read.recommends.length === 0}
      <p class="emma-install-hint">{localize('Relations.None')}</p>
    {/if}
  {/if}
{/snippet}

<section class="emma-install" aria-labelledby="{uid}-heading">
  <h3 id="{uid}-heading">
    {type === 'system'
      ? localize('Install.Systems')
      : scope === undefined
        ? localize('Install.Modules')
        : format(takesAn(scope) ? 'Install.ModulesForAn' : 'Install.ModulesForA', { scope })}
  </h3>
  <form
    class="emma-install-manifest emma-busy-host"
    aria-busy={updates.busy.activityOf(`manifest:${type}`) !== undefined}
    onsubmit={event => {
      event.preventDefault();
      void addFromUrl();
    }}>
    <label for="{uid}-manifest">{localize('Manifest.Label')}</label>
    <input
      id="{uid}-manifest"
      type="url"
      required
      placeholder={type === 'system' ? 'https://…/system.json' : 'https://…/module.json'}
      value={manifestUrl}
      oninput={event => {
        manifestUrl = event.currentTarget.value;
      }} />
    <button
      type="submit"
      aria-label={localize('Manifest.Add')}
      data-tooltip={localize('Manifest.Add')}
      disabled={updates.locked || fromUrl === 'reading' || manifestUrl.trim() === ''}>
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
    </button>
    <BusyMark activity={updates.busy.activityOf(`manifest:${type}`)} />
  </form>
  {#if fromUrl === 'reading'}
    <p role="status">{localize('Manifest.Reading')}</p>
  {:else if fromUrl?.ok === true}
    <p role="status">{format('Manifest.Added', { title: fromUrl.title, version: fromUrl.version })}</p>
  {:else if fromUrl !== null}
    {@const refused = fromUrl}
    <div class="emma-install-failed" role="alert">
      <p>{refused.reason}</p>
      {#if refused.explanation !== undefined}
        <ul>
          {#each refused.explanation as line, index (index)}
            <li>{line}</li>
          {/each}
        </ul>
      {/if}
      {#if refused.override !== undefined}
        <button
          type="button"
          class="emma-install-override"
          disabled={updates.locked}
          onclick={() => {
            override(refused);
          }}>
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          {localize('Manifest.Override')}
        </button>
      {/if}
    </div>
  {/if}
  {#each forced as install (install.key)}
    <p class="emma-install-forced">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      {format('Manifest.Forced', { title: install.title, version: install.version })}
      <button
        type="button"
        disabled={updates.locked}
        onclick={() => {
          updates.unforce(install.key);
        }}>{format('Manifest.TakeOut', { title: install.title })}</button>
    </p>
  {/each}
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
      {#if type === 'module'}
        <label>
          <input
            type="checkbox"
            checked={updates.alwaysRecommended}
            disabled={updates.locked}
            onchange={event => {
              updates.alwaysRecommended = event.currentTarget.checked;
            }} />
          {localize('Recommends.Always')}
        </label>
      {/if}
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
    <ul class="emma-install-list">
      {#each found.slice(0, shown) as pkg (pkg.id)}
        {@const key = `${pkg.type}:${pkg.id}`}
        {@const planned = updates.chosenOf(key)}
        {@const state = added.get(key)}
        <li class="emma-busy-host" aria-busy={updates.busy.activityOf(`install:${key}`) !== undefined}>
          <input
            type="checkbox"
            class="emma-install-choose"
            checked={planned !== undefined}
            disabled={updates.locked || state === 'adding' || (pkg.unowned && planned === undefined)}
            aria-label={format('Install.Choose', { title: pkg.title })}
            onchange={event => {
              void choose(event.currentTarget, key, pkg);
            }} />
          <details
            class="emma-install-details"
            ontoggle={event => {
              if (event.currentTarget.open) void readRelations(pkg);
            }}>
            <summary>
              <span class="emma-install-title">{pkg.title}</span>
              {#if pkg.author !== undefined}
                <span class="emma-install-author">{format('Install.By', { author: pkg.author })}</span>
              {/if}
              <span class="emma-install-version">{format('Install.Newest', { version: pkg.version })}</span>
              {#if planned !== undefined}
                <span class="emma-install-planned">{format('Install.Planned', { version: planned })}</span>
              {:else if state === 'adding'}
                <span class="emma-install-planned">{localize('Install.Adding')}</span>
              {/if}
              <i class="emma-install-caret fa-solid fa-caret-right" aria-hidden="true"></i>
            </summary>
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
            {@render relationsOf(pkg)}
          </details>
          {#if pkg.unowned && planned === undefined}
            <p class="emma-install-unowned">
              <i class="fa-solid fa-lock" aria-hidden="true"></i>
              {localize('Install.Unowned')}
            </p>
          {/if}
          {#if typeof state === 'object'}
            <div class="emma-install-failed">
              <p>{state.reason}</p>
              {#if state.explanation !== undefined}
                <ul>
                  {#each state.explanation as line, index (index)}
                    <li>{line}</li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
          <BusyMark activity={updates.busy.activityOf(`install:${key}`)} />
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

  .emma-install .emma-install-list {
    list-style: none;
    padding-left: 0;
  }

  .emma-install-list > li {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.5rem;
    align-items: start;
  }

  .emma-install-list > li > :not(.emma-install-choose) {
    grid-column: 2;
  }

  .emma-install-choose {
    margin: 0.2rem 0 0;
  }

  .emma-install-details summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.5rem;
    cursor: pointer;
    list-style: none;
  }

  .emma-install-details summary::-webkit-details-marker {
    display: none;
  }

  .emma-install-caret {
    margin-left: auto;
    transition: transform 0.15s;
  }

  .emma-install-details[open] .emma-install-caret {
    transform: rotate(90deg);
  }

  .emma-install-planned {
    font-size: 0.85em;
    font-style: italic;
  }

  .emma-install-failed p {
    margin: 0;
  }

  .emma-install-details h4 {
    margin: 0.5rem 0 0.25rem;
    font-size: 0.9em;
  }

  .emma-install .emma-install-relations {
    list-style: none;
    padding-left: 1rem;
  }

  .emma-install-relations label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .emma-install-manifest {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .emma-install-manifest input {
    flex: 1;
    min-width: 0;
  }

  .emma-install .emma-install-manifest button {
    flex: 0 0 auto;
  }

  /* Dark red on pale red, 10.2:1, with a 7.1:1 border, whatever the theme; the triangle and the words say it too. */
  .emma-install .emma-install-override {
    margin-top: 0.25rem;
    border: 1px solid #842029;
    background: #f8d7da;
    color: #58151c;
  }

  .emma-install-forced {
    color: var(--color-level-error, #c00);
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
