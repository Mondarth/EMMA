import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import BusyMark from '../../../src/component/BusyMark.svelte';
import InstallationTree from '../../../src/component/InstallationTree.svelte';
import LockSection from '../../../src/component/LockSection.svelte';
import { buildOverview } from '../../../src/lib/overview';
import { ROOT } from '../../../src/lib/tree';
import { installation, installedModule, noUpdates } from '../../mocks/fixtures';

describe('BusyMark', () => {
  test('shows nothing while EMMA is not busy', () => {
    const { container } = render(BusyMark, { activity: undefined });
    expect(container.querySelector('.emma-busy')).toBeNull();
  });

  test.each([
    ['planning', 'Planning'],
    ['reading', 'Reading'],
    ['checking', 'Checking'],
    ['refreshing', 'Refreshing'],
    ['locking', 'Locking'],
    ['ignoring', 'Ignoring'],
    ['resuming', 'Resuming'],
  ] as const)('says %s in a word, beside a spinner', (activity, word) => {
    render(BusyMark, { activity });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(word);
    expect(status.querySelector('.fa-spinner.fa-spin')).not.toBeNull();
  });
});

describe('an item EMMA is busy with', () => {
  test('is a tree row overlaid while the plan is worked out for it, and itself again after', async () => {
    const overview = buildOverview(installation({ modules: [installedModule('lib', 'Library', '1.0.0')] }), new Map());
    const updates = new UpdateState(noUpdates);
    await updates.searchFor(overview);
    render(InstallationTree, { overview, selected: ROOT, onSelect: vi.fn(), updates });
    const root = screen.getAllByRole('treeitem')[0] as HTMLElement;
    expect(root).toHaveAttribute('aria-busy', 'false');

    let finish = () => {};
    const working = updates.busy.run(
      `tree:${root.dataset['key'] ?? ''}`,
      'planning',
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );

    await vi.waitFor(() => {
      expect(within(root).getByRole('status')).toHaveTextContent('Planning');
    });
    expect(root).toHaveAttribute('aria-busy', 'true');
    finish();
    await working;
    await vi.waitFor(() => {
      expect(within(root).queryByRole('status')).toBeNull();
    });
  });

  test('is a section button, overlaid and disabled, so that it is not asked for twice', () => {
    const onLock = vi.fn();
    render(LockSection, {
      title: 'Library',
      version: '1.0.0',
      locked: false,
      disabled: false,
      onLock,
      busy: 'locking',
    });
    const button = screen.getByRole('button', { name: /Lock Library at 1\.0\.0/ });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(within(button).getByRole('status')).toHaveTextContent('Locking');
  });
});
