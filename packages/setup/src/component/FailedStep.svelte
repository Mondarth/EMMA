<!--
  Why a step of the run shown failed, in the panel for its package: what EMMA asked Foundry to do, and what Foundry
  answered, leading the panel while the run is shown. Nothing for a package whose step did not fail.
-->
<script lang="ts">
  import type { PlanRun } from '../app/setup-state.svelte';
  import { format, localize } from '../lib/i18n';

  interface Props {
    /** The run shown, if any. */
    run: PlanRun | null;
    /** The package's key. */
    key: string;
  }

  let { run, key }: Props = $props();

  const uid = $props.id();
  const step = $derived(run?.states[key] === 'failed' ? run.steps.find(candidate => candidate.key === key) : undefined);
  const message = $derived(run?.failures?.[key]);
</script>

{#if step !== undefined && (step.kind === 'install' || step.kind === 'uninstall')}
  <section class="emma-failed-step" aria-labelledby="{uid}-heading" role="alert">
    <h3 id="{uid}-heading">
      <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
      {step.kind === 'install'
        ? format('Failure.Install', { title: step.title, version: step.version })
        : format('Failure.Uninstall', { title: step.title })}
    </h3>
    {#if step.kind === 'install' && step.manifest !== undefined}
      <p>{format('Failure.Asked', { version: step.version })}</p>
      <p class="emma-failed-manifest">
        <a href={step.manifest} target="_blank" rel="noopener noreferrer">{step.manifest}</a>
      </p>
    {/if}
    <p>{localize('Failure.Answered')}</p>
    <blockquote>{message !== undefined && message !== '' ? message : localize('Failure.NoAnswer')}</blockquote>
    {#if step.kind === 'install'}
      <p class="emma-failed-hint">{localize('Failure.ManifestHint')}</p>
    {/if}
  </section>
{/if}

<style>
  .emma-failed-step {
    margin-bottom: 1rem;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--color-level-error, #d33);
  }

  .emma-failed-step h3 i {
    color: var(--color-level-error, #d33);
  }

  .emma-failed-manifest {
    word-break: break-all;
  }

  .emma-failed-step blockquote {
    margin: 0.25rem 0 0.5rem;
    white-space: pre-wrap;
  }

  .emma-failed-hint {
    font-size: 0.9em;
    opacity: 0.85;
  }
</style>
