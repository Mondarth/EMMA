<script lang="ts">
  import type { PlanEntry, SetupCheck, SetupReportData, SetupSolve } from '@module/adapters/report';
  import { format, formatList, localize } from '@module/lib/i18n';
  import { log } from '@module/lib/logger';
  import type { ReportStyle } from '@module/lib/report-text';
  import {
    REPORT_STYLES,
    changeText,
    checkText,
    planTables,
    planText,
    updateText,
    setupSummary,
  } from '@module/lib/report-text';

  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    /** The active modules in the order to install them. */
    plan: readonly PlanEntry[];
    /** What checking the setup chosen found. */
    check: SetupCheck;
    /** The best setup keeping the versions chosen, once worked out. */
    solve: Promise<SetupSolve>;
    /** Saves the report shown, as text. */
    onDownload: (text: string, style: ReportStyle) => void;
    /** Chooses the versions the update recommends, in the hypothetical setup reported on, giving the report after. */
    apply: SetupReportData['apply'];
  }

  const { plan: firstPlan, check: firstCheck, solve: firstSolve, apply: firstApply, onDownload }: Props = $props();

  // The report shown: the one given, then the one on the setup each choice of recommended versions makes. The window
  // is mounted afresh for each report, so the one given is only read once.
  // svelte-ignore state_referenced_locally
  let report: SetupReportData = $state.raw({
    plan: firstPlan,
    check: firstCheck,
    solve: firstSolve,
    apply: firstApply,
  });
  const { plan, check } = $derived(report);

  const uid = $props.id();

  let style = $state<ReportStyle>('plan');
  let solved = $state<SetupSolve | null>(null);
  let failed = $state(false);

  // Follows the report's solve, a new one with each report.
  $effect(() => {
    let live = true;
    solved = null;
    failed = false;
    report.solve.then(
      result => {
        if (live) solved = result;
      },
      (error: unknown) => {
        log.error('Unable to work out the best versions', error);
        if (live) failed = true;
      },
    );
    return () => {
      live = false;
    };
  });

  /** The report shown, as text; `null` while the setup is still being resolved, or could not be. */
  const text = $derived.by((): string | null => {
    switch (style) {
      case 'plan':
        return planText(check.setup, plan);
      case 'check':
        return checkText(check);
      default:
        return solved === null ? null : updateText(check.setup, solved);
    }
  });

  const downloadLabel = $derived(localize('MONDARTH-EMMA.Report.Download'));

  /** The changes the update recommends; none until it is worked out, or when it finds none to make. */
  const changes = $derived(solved?.solution.kind === 'found' ? solved.solution.changes : []);

  const applyLabel = $derived(localize('MONDARTH-EMMA.Report.Apply'));
</script>

<div class="emma-report">
  <div class="emma-report-controls">
    <label for={`${uid}-style`}>{localize('MONDARTH-EMMA.Report.Style')}</label>
    <!-- Only it changes the style, so it shows the style without being told: the first, the plan, to start. -->
    <select
      id={`${uid}-style`}
      onchange={(event: Event & { currentTarget: HTMLSelectElement }) => {
        // The options are the styles.
        style = event.currentTarget.value as ReportStyle;
      }}>
      {#each REPORT_STYLES as option (option)}
        <option value={option}>{localize(`MONDARTH-EMMA.Report.Styles.${option}`)}</option>
      {/each}
    </select>
    {#if style === 'update' && changes.length > 0}
      <button
        type="button"
        class="icon fa-solid fa-wand-magic-sparkles"
        aria-label={applyLabel}
        data-tooltip={applyLabel}
        onclick={() => {
          // Every style then reports on the setup with the versions chosen.
          report = report.apply(changes);
        }}></button>
    {/if}
    <button
      type="button"
      class="icon fa-solid fa-download"
      aria-label={downloadLabel}
      data-tooltip={downloadLabel}
      disabled={text === null}
      onclick={() => {
        // Only enabled once there is text to download.
        onDownload(text as string, style);
      }}></button>
  </div>

  {#if style === 'plan'}
    <section class="emma-report-pane" aria-labelledby={`${uid}-plan`}>
      <h3 id={`${uid}-plan`}>{localize('MONDARTH-EMMA.Report.Plan.Heading')}</h3>
      <p class="emma-report-setup">{setupSummary(check.setup)}</p>
      {#if plan.length === 0}
        <p>{localize('MONDARTH-EMMA.Report.Plan.Empty')}</p>
      {:else}
        {@const tables = planTables(plan)}
        {#each [{ key: 'Changes', none: 'NoChanges', lines: tables.changes }, { key: 'Kept', none: 'NoneKept', lines: tables.kept }] as list (list.key)}
          <section class="emma-report-plan-list" aria-labelledby={`${uid}-plan-${list.key}`}>
            <h4 id={`${uid}-plan-${list.key}`}>{localize(`MONDARTH-EMMA.Report.Plan.${list.key}`)}</h4>
            {#if list.lines === null}
              <p>{localize(`MONDARTH-EMMA.Report.Plan.${list.none}`)}</p>
            {:else}
              <pre class="emma-report-plan">{list.lines.join('\n')}</pre>
            {/if}
          </section>
        {/each}
      {/if}
    </section>
  {:else if style === 'check'}
    <section class="emma-report-pane" aria-labelledby={`${uid}-check`}>
      <h3 id={`${uid}-check`}>{localize('MONDARTH-EMMA.Report.Check.Heading')}</h3>
      <p class="emma-report-setup">{setupSummary(check.setup)}</p>
      <p class={['emma-report-verdict', check.valid ? 'valid' : 'invalid']}>
        <i class={['fa-solid', check.valid ? 'fa-circle-check' : 'fa-circle-xmark']} inert></i>
        {localize(check.valid ? 'MONDARTH-EMMA.Report.Check.Valid' : 'MONDARTH-EMMA.Report.Check.Invalid')}
      </p>
      {#if check.modules.length === 0}
        <p>{localize('MONDARTH-EMMA.Report.Plan.Empty')}</p>
      {:else}
        <ul class="emma-report-packages">
          {#each check.modules as reported (reported.id)}
            <li>
              <span class="emma-report-package">
                <strong>{reported.title}</strong>
                <VersionBadge version={reported.version} badge={reported.badge} />
                {#if reported.badge !== null}
                  <span class="emma-report-verdict-text">{reported.badge.text}</span>
                {/if}
              </span>
              <ul class="emma-report-notes">
                {#each reported.notes.length === 0 ? [localize('MONDARTH-EMMA.Report.Check.Nothing')] : reported.notes as note (note)}
                  <li>{note}</li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <section class="emma-report-pane" aria-labelledby={`${uid}-solve`}>
      <h3 id={`${uid}-solve`}>{localize('MONDARTH-EMMA.Report.Solve.Heading')}</h3>
      <p class="emma-report-setup">{setupSummary(check.setup)}</p>
      {#if failed}
        <p class="emma-report-verdict invalid">
          <i class="fa-solid fa-triangle-exclamation" inert></i>
          {localize('MONDARTH-EMMA.Report.Solve.Failed')}
        </p>
      {:else if solved === null}
        <p role="status">
          <i class="fa-solid fa-spinner fa-spin" inert></i>
          {localize('MONDARTH-EMMA.Report.Solve.Loading')}
        </p>
      {:else}
        {@const { solution, unloaded } = solved}
        {#if solution.kind === 'found'}
          <p class="emma-report-verdict valid">
            <i class="fa-solid fa-circle-check" inert></i>
            {localize('MONDARTH-EMMA.Report.Solve.Found')}
            {localize(
              solution.changes.length === 0
                ? 'MONDARTH-EMMA.Report.Solve.NoChanges'
                : 'MONDARTH-EMMA.Report.Solve.Changes',
            )}
          </p>
          {#if solution.changes.length > 0}
            <ul class="emma-report-changes">
              {#each solution.changes as change (change.title)}
                <li>{changeText(change)}</li>
              {/each}
            </ul>
          {/if}
        {:else if solution.kind === 'none'}
          <p class="emma-report-verdict invalid">
            <i class="fa-solid fa-circle-xmark" inert></i>
            {localize('MONDARTH-EMMA.Report.Solve.None')}
          </p>
          <ul class="emma-report-explanation">
            {#each solution.lines as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        {:else}
          <p>{format('MONDARTH-EMMA.Report.Solve.Undecided', { packages: formatList(solution.needs) })}</p>
        {/if}
        {#if unloaded.length > 0}
          <p>{format('MONDARTH-EMMA.Report.Solve.Unloaded', { packages: formatList(unloaded) })}</p>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  /* The report fills the window: the controls stay put, and the report shown scrolls beneath them. */
  .emma-report {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    font-family: var(--font-body);
  }

  .emma-report p,
  .emma-report h3,
  .emma-report h4 {
    margin: 0;
  }

  .emma-report h4 {
    font-family: var(--font-body);
    font-size: var(--font-size-14);
    font-weight: bold;
  }

  /* Foundry's headings are sized for documents; these head the parts of a small window. */
  .emma-report h3 {
    padding-bottom: 0.125rem;
    border-bottom: 1px solid var(--color-border);
    font-family: var(--font-body);
    font-size: var(--font-size-16);
    font-weight: bold;
  }

  .emma-report-controls {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.5rem;
  }

  .emma-report-pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .emma-report-controls select {
    flex: 0 1 12rem;
  }

  .emma-report-controls button {
    flex: none;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .emma-report-setup {
    color: var(--color-text-secondary);
  }

  /* The plan's columns line up as they do in the downloaded text. */
  .emma-report-plan {
    margin: 0;
    padding: 0.5rem;
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-12);
    white-space: pre;
  }

  .emma-report-verdict.valid i {
    color: var(--color-level-success);
  }

  .emma-report-verdict.invalid i {
    color: var(--color-level-error);
  }

  ul {
    margin: 0;
    padding-inline-start: 1.25rem;
  }

  .emma-report-packages {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0;
    list-style: none;
  }

  .emma-report-package {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .emma-report-verdict-text {
    color: var(--color-text-secondary);
  }

  .emma-report-explanation {
    padding: 0;
    list-style: none;
  }
</style>
