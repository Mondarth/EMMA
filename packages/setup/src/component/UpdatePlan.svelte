<!--
  The update plan, below the tree and the panel beside it while Update mode is on and versions are chosen: each package
  whose chosen version differs from the one installed, with both.
-->
<script lang="ts">
  import type { UpdateState } from '../app/update-state.svelte';
  import { localize } from '../lib/i18n';
  import type { Overview } from '../lib/overview';

  interface Props {
    overview: Overview;
    updates: UpdateState;
  }

  let { overview, updates }: Props = $props();

  const uid = $props.id();

  /** The installed packages' titles, by package key. */
  const titles = $derived(
    new Map<string, string>([
      ['core', localize('Tree.Root')],
      ...overview.systems.map(({ id, title }) => [`system:${id}`, title] as const),
      ...overview.modules.map(({ module: { id, title } }) => [`module:${id}`, title] as const),
    ]),
  );
</script>

<section class="emma-update-plan" aria-labelledby="{uid}-heading">
  <header>
    <h3 id="{uid}-heading">{localize('Update.Plan')}</h3>
    <button
      type="button"
      onclick={() => {
        updates.clear();
      }}>
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      {localize('Update.Clear')}
    </button>
  </header>
  <table>
    <thead>
      <tr>
        <th scope="col">{localize('Update.Package')}</th>
        <th scope="col">{localize('Update.Installed')}</th>
        <th scope="col">{localize('Update.Chosen')}</th>
      </tr>
    </thead>
    <tbody>
      {#each updates.choices as choice (choice.key)}
        <tr>
          <th scope="row">{titles.get(choice.key) ?? choice.key}</th>
          <td>{choice.installed}</td>
          <td>{choice.chosen}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  .emma-update-plan {
    overflow: auto;
    padding: 0 0.5rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  header button {
    flex: none;
    width: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    padding: 0.15rem 0.5rem;
  }

  tbody th {
    font-weight: normal;
  }

  td {
    font-family: var(--font-mono, monospace);
  }
</style>
