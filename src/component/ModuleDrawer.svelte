<script lang="ts">
  import type { ModuleAuthor, ModuleEntry } from '@module/adapters/modules';
  import { format, localize } from '@module/lib/i18n';

  interface Props {
    /** The module to describe. */
    entry: ModuleEntry;
    /** The drawer's DOM ID, which the button opening it controls. */
    id: string;
  }

  const { entry, id }: Props = $props();

  const empty = $derived(entry.description === '' && entry.authors.length === 0 && entry.languages.length === 0);
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

<div {id} class="emma-drawer">
  {#if empty}
    <p class="emma-drawer-empty">{localize('MONDARTH-EMMA.Drawer.Empty')}</p>
  {:else}
    <dl>
      {#if entry.description !== ''}
        <dt>{localize('MONDARTH-EMMA.Drawer.Description')}</dt>
        <!-- The adapter cleans the description with Foundry's cleanHTML, as Foundry does before showing it. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <dd class="emma-drawer-description">{@html entry.description}</dd>
      {/if}

      {#if entry.authors.length > 0}
        <dt>{localize('MONDARTH-EMMA.Drawer.Authors')}</dt>
        <dd>
          {#if entry.authors.length === 1}
            {@render author(entry.authors[0] as ModuleAuthor)}
          {:else}
            <details>
              <summary>{format('MONDARTH-EMMA.Drawer.AuthorCount', { count: String(entry.authors.length) })}</summary>
              <ul>
                {#each entry.authors as each, index (index)}
                  <li>{@render author(each)}</li>
                {/each}
              </ul>
            </details>
          {/if}
        </dd>
      {/if}

      {#if entry.languages.length > 0}
        <dt>{localize('MONDARTH-EMMA.Drawer.Languages')}</dt>
        <dd>
          {#if entry.languages.length === 1}
            {@const [language] = entry.languages}
            <span lang={language?.lang}>{language?.name}</span>
          {:else}
            <details>
              <summary
                >{format('MONDARTH-EMMA.Drawer.LanguageCount', { count: String(entry.languages.length) })}</summary>
              <ul>
                {#each entry.languages as { lang, name }, index (index)}
                  <li>{name} <span class="emma-drawer-code">({lang})</span></li>
                {/each}
              </ul>
            </details>
          {/if}
        </dd>
      {/if}
    </dl>
  {/if}
</div>

<style>
  .emma-drawer {
    padding: 0.25rem 0.5rem 0.5rem;
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

  .emma-drawer summary {
    cursor: pointer;
  }

  .emma-drawer ul {
    margin: 0.25rem 0 0;
    padding-left: 1rem;
  }

  .emma-drawer-contact {
    margin-left: 0.25rem;
  }

  .emma-drawer-code,
  .emma-drawer-empty {
    color: var(--color-text-secondary);
  }

  .emma-drawer-empty {
    margin: 0;
  }
</style>
