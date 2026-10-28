<script lang="ts">
  import type { ModuleAuthor, ModuleEntry, ModuleRelation } from '@module/adapters/modules';
  import { format, localize } from '@module/lib/i18n';
  import type { DrawerFields } from '@module/state/drawer-fields.svelte';
  import { hasDetail } from '@module/state/drawer-fields.svelte';

  import CountedList from './CountedList.svelte';

  interface Props {
    /** The module to describe. */
    entry: ModuleEntry;
    /** The drawer's DOM ID, which the button opening it controls. */
    id: string;
    /** The details the user has chosen to show. */
    fields: DrawerFields;
  }

  const { entry, id, fields }: Props = $props();

  const chosen = $derived(fields.shown);
  const shown = $derived(chosen.filter(field => hasDetail(entry, field)));

  /**
   * The summary of a dropdown listing several of a detail.
   * @param field - The detail
   * @param total - How many there are
   * @returns The summary
   */
  function count(field: string, total: number): string {
    return format(`MONDARTH-EMMA.Drawer.Count.${field}`, { count: String(total) });
  }
</script>

{#snippet author({ name, url, email, discord }: ModuleAuthor)}
  {#if url === undefined}
    <span>{name}</span>
  {:else}
    <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
  {/if}
  {#if email !== undefined}
    {@const label = format('MONDARTH-EMMA.Drawer.Email', { name })}
    <a class="emma-drawer-contact" href={`mailto:${email}`} aria-label={label} data-tooltip={label}>
      <i class="fa-solid fa-envelope" inert></i>
    </a>
  {/if}
  {#if discord !== undefined}
    <span class="emma-drawer-contact">
      <i class="fa-brands fa-discord" aria-label={localize('MONDARTH-EMMA.Drawer.Discord')} role="img"></i>
      {discord}
    </span>
  {/if}
{/snippet}

<!-- A related package, with its type where the relationship does not imply it, and the reason the manifest gives. -->
{#snippet relation({ type, title, reason }: ModuleRelation, implied: ModuleRelation['type'])}
  <span>{title}</span>
  {#if type !== implied}
    <span class="emma-drawer-secondary">({localize(`MONDARTH-EMMA.Drawer.Type.${type}`)})</span>
  {/if}
  {#if reason !== undefined}
    <span class="emma-drawer-reason">{reason}</span>
  {/if}
{/snippet}

<div {id} class="emma-drawer">
  {#if chosen.length === 0}
    <p class="emma-drawer-secondary">{localize('MONDARTH-EMMA.Drawer.NoneChosen')}</p>
  {:else if shown.length === 0}
    <p class="emma-drawer-secondary">{localize('MONDARTH-EMMA.Drawer.Empty')}</p>
  {:else}
    <dl>
      {#each shown as field (field)}
        <dt>{localize(`MONDARTH-EMMA.Drawer.Field.${field}`)}</dt>
        {#if field === 'description'}
          <!-- The adapter cleans the description with Foundry's cleanHTML, as Foundry does before showing it. -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <dd class="emma-drawer-description">{@html entry.description}</dd>
        {:else if field === 'authors'}
          <dd><CountedList items={entry.authors} summary={count(field, entry.authors.length)} item={author} /></dd>
        {:else if field === 'languages'}
          <dd>
            <CountedList items={entry.languages} summary={count(field, entry.languages.length)}>
              {#snippet item({ lang, name })}
                <span {lang}>{name}</span> <span class="emma-drawer-secondary">({lang})</span>
              {/snippet}
            </CountedList>
          </dd>
        {:else if field === 'links'}
          <dd>
            <ul class="emma-drawer-inline">
              {#each entry.links as { kind, url } (kind)}
                <li>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {localize(`MONDARTH-EMMA.Drawer.Link.${kind}`)}
                  </a>
                </li>
              {/each}
            </ul>
          </dd>
        {:else if field === 'compatibility'}
          <dd>
            <ul class="emma-drawer-inline">
              {#each ['minimum', 'verified', 'maximum'] as const as bound (bound)}
                {@const version = entry.compatibility[bound]}
                {#if version !== undefined}
                  <li>
                    <span class="emma-drawer-secondary">
                      {localize(`MONDARTH-EMMA.Drawer.Compatibility.${bound}`)}
                    </span>
                    {version}
                  </li>
                {/if}
              {/each}
            </ul>
          </dd>
        {:else if field === 'systems' || field === 'requires' || field === 'recommends' || field === 'conflicts'}
          {@const related = entry.relationships[field]}
          {@const implied = field === 'systems' ? 'system' : 'module'}
          <dd>
            <CountedList items={related} summary={count(field, related.length)}>
              {#snippet item(each: ModuleRelation)}
                {@render relation(each, implied)}
              {/snippet}
            </CountedList>
          </dd>
        {:else if field === 'packs'}
          <dd>
            <CountedList items={entry.packs} summary={count(field, entry.packs.length)}>
              {#snippet item({ label, type })}
                {label} <span class="emma-drawer-secondary">({type})</span>
              {/snippet}
            </CountedList>
          </dd>
        {:else if field === 'library'}
          <dd>{localize('MONDARTH-EMMA.Drawer.IsLibrary')}</dd>
        {:else}
          <dd><code>{entry.id}</code></dd>
        {/if}
      {/each}
    </dl>
  {/if}
</div>

<style>
  .emma-drawer {
    margin-top: 0.25rem;
    padding: 0.375rem 0.5rem 0.5rem;
    border-radius: 3px;
    /* A faint tint of the theme's text colour: a very pale grey on the light theme, a slight lift on the dark one. */
    background: color-mix(in srgb, var(--color-text-primary) 6%, transparent);
    font-size: var(--font-size-12);
    cursor: auto;
    user-select: text;
  }

  .emma-drawer dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.25rem 0.75rem;
    margin: 0;
  }

  .emma-drawer dt {
    font-weight: bold;
    color: var(--color-text-secondary);
  }

  .emma-drawer dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .emma-drawer-description :global(:first-child) {
    margin-top: 0;
  }

  .emma-drawer-description :global(:last-child) {
    margin-bottom: 0;
  }

  .emma-drawer-inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .emma-drawer-contact {
    margin-left: 0.25rem;
  }

  .emma-drawer-reason {
    display: block;
    color: var(--color-text-secondary);
  }

  .emma-drawer-secondary {
    color: var(--color-text-secondary);
  }

  .emma-drawer p {
    margin: 0;
  }
</style>
