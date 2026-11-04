import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import type { CoreTargetState, CoreUpdating } from '../../../src/app/setup-state.svelte';
import CoreStep from '../../../src/component/CoreStep.svelte';

const CAN = { canUpdate: true, channel: 'stable' };

/**
 * Render the step.
 * @param target - What Foundry's updater would install
 * @param more - What else differs
 * @param more.core - Whether Foundry can update itself
 * @param more.updating - Where updating has got
 * @returns The update's spy, and a user to act with
 */
function renderStep(target: CoreTargetState, more: { core?: typeof CAN; updating?: CoreUpdating | null } = {}) {
  const onUpdate = vi.fn();
  // `target` is also an option of `render`, so the props are given apart.
  render(CoreStep, {
    props: { version: '14.369', core: more.core ?? CAN, target, updating: more.updating ?? null, onUpdate },
  });
  return { onUpdate, user: userEvent.setup() };
}

describe('CoreStep', () => {
  test("warns against updating in place, pointing to Foundry's guide to testing an update first", () => {
    renderStep(null);

    const step = screen.getByRole('region', { name: 'Updating Foundry VTT to 14.369' });
    expect(step).toHaveTextContent('Updating Foundry VTT in place is not recommended.');
    expect(screen.getByRole('link', { name: 'Updating Foundry VTT' })).toHaveAttribute(
      'href',
      'https://foundryvtt.com/article/updating/',
    );
  });

  test.each<[string, CoreTargetState, { canUpdate: boolean; channel: string }, string]>([
    [
      'updates are switched off',
      { version: '14.369', manual: false },
      { canUpdate: false, channel: 'stable' },
      '(--noupdate)',
    ],
    ['it has not asked yet', null, CAN, 'Asking Foundry which build'],
    ['it is asking', 'checking', CAN, 'Asking Foundry which build'],
    ['it could not ask', 'failed', CAN, 'Foundry could not say which build'],
    ['there is no build', { none: 'Up to date' }, CAN, 'offers no build to update to: Up to date'],
    [
      'it would install another',
      { version: '14.370', manual: false },
      CAN,
      'would install 14.370, not 14.369: it installs only the newest build on its channel (stable).',
    ],
    ['the build is installed by hand', { version: '14.369', manual: true }, CAN, 'installs 14.369 only by hand'],
  ])('offers no update in place when %s', (_label, target, core, words) => {
    renderStep(target, { core });

    expect(screen.getByRole('region')).toHaveTextContent(words);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('updates in place only once the code shown is typed', async () => {
    const { onUpdate, user } = renderStep({ version: '14.369', manual: false });
    const label = screen.getByText(/^To update in place, type/).textContent;
    const code = /type ([A-Z0-9]{6}):/.exec(label)?.[1] ?? '';
    expect(code).toHaveLength(6);
    const button = screen.getByRole('button', { name: 'Update Foundry VTT to 14.369 in place' });
    expect(button).toBeDisabled();

    await user.type(screen.getByRole('textbox'), code.slice(0, 5));
    expect(button).toBeDisabled();
    await user.type(screen.getByRole('textbox'), code.slice(5).toLowerCase());
    expect(button).toBeEnabled();

    await user.click(button);
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  test('says why Foundry did not update, for another try', () => {
    renderStep({ version: '14.369', manual: false }, { updating: { kind: 'failed', message: 'Not allowed' } });

    expect(screen.getByRole('region')).toHaveTextContent('Foundry did not update: Not allowed');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test.each([
    [true, 'EMMA kept the rest of the plan'],
    [false, 'EMMA could not keep the rest of the plan'],
  ])('says the update has begun, and whether the rest of the plan was kept (%s)', (kept, words) => {
    renderStep({ version: '14.369', manual: false }, { updating: { kind: 'begun', version: '14.369', kept } });

    expect(screen.getByRole('status')).toHaveTextContent('Foundry VTT is updating to 14.369.');
    expect(screen.getByRole('status')).toHaveTextContent(words);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
