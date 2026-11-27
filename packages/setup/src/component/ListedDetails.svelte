<!--
  What Foundry's listing says of a package: its description, as plain text, authors, newest version, the Foundry VTT
  builds it declares, the game systems a module is for, its tags, whether it is premium or exclusive content, and its
  web page. The Install section's drawers show it, and so does the panel of a package the plan installs anew.
-->
<script lang="ts">
  import type { ListedPackage } from '../foundry/setup-game';

  import { localize } from '../lib/i18n';
  import { compatibilityText, tagText } from '../lib/install';

  interface Props {
    pkg: ListedPackage;
  }

  let { pkg }: Props = $props();
</script>

<dl class="emma-listed">
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
      {localize(pkg.premium ? (pkg.unowned ? 'Install.PremiumUnowned' : 'Install.Premium') : 'Install.Exclusive')}
    </dd>
  {/if}
  {#if pkg.url !== undefined}
    <dt>{localize('Install.WebPage')}</dt>
    <dd><a href={pkg.url} target="_blank" rel="noopener noreferrer">{pkg.url}</a></dd>
  {/if}
</dl>

<style>
  .emma-listed {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 0.75rem;
  }

  dt {
    font-weight: bold;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
