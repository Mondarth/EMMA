import { render, screen } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import type { PlanRun } from '../../../src/app/setup-state.svelte';
import FailedStep from '../../../src/component/FailedStep.svelte';

const KEY = 'module:chatlog-prune';

/**
 * A run whose install of Chat Log Prune 14.0.2 failed, as Foundry answered.
 * @param answer - What Foundry answered
 * @returns The run
 */
const failedWith = (answer: string): PlanRun => ({
  steps: [
    {
      kind: 'install',
      key: KEY,
      type: 'module',
      id: 'chatlog-prune',
      title: 'Chat Log Prune',
      version: '14.0.2',
      manifest: 'https://gitlab.com/api/v4/projects/77500704/packages/generic/chatlog-prune/v14.0.2/module.json',
    },
  ],
  states: { [KEY]: 'failed' },
  over: true,
  failures: { [KEY]: answer },
});

describe('a failed install', () => {
  // Regression: every failed install was told its manifest may give another version, though here GitLab refused the
  // download for too many requests.
  test('suggests what fits Foundry’s answer, not the manifest hint', () => {
    render(FailedStep, {
      run: failedWith(
        '[chatlog-prune] An unexpected error occurred when downloading file ' +
          'https://gitlab.com/tposney/chatlog-prune/-/raw/v14/package/chatlog-prune.zip: Too Many Requests',
      ),
      key: KEY,
    });
    const failed = screen.getByRole('alert');
    expect(failed).toHaveTextContent('gitlab.com refused the download for too many requests');
    expect(failed).not.toHaveTextContent('A manifest URL can give a version other than');
  });

  test('keeps the manifest hint for an answer that is not of a download', () => {
    render(FailedStep, { run: failedWith('No version 14.0.2 found in the manifest'), key: KEY });
    expect(screen.getByRole('alert')).toHaveTextContent('A manifest URL can give a version other than');
  });
});
