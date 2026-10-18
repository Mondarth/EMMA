import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import SplitView from '@component/SplitView.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules, ENTRIES } from './fixtures';

const INACTIVE = 'MONDARTH-EMMA.Split.Inactive';
const ACTIVE = 'MONDARTH-EMMA.Split.Active';

/**
 * The titles listed on one side.
 * @param name - The side's heading
 * @returns The titles, in display order
 */
function titles(name: string): string[] {
  return within(screen.getByRole('treegrid', { name: new RegExp(`^${name}`) }))
    .queryAllByRole('row')
    .map(element => element.querySelector('.emma-option-title')?.textContent ?? '');
}

describe('SplitView', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('shows inactive modules on the left, the transfer buttons, then active modules on the right', () => {
    render(SplitView, { modules: createModules(), canManage: true });

    const [inactive, active] = screen.getAllByRole('treegrid');
    const deactivate = screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Deactivate' });
    expect(inactive).toHaveAccessibleName(expect.stringMatching(new RegExp(`^${INACTIVE}`)));
    expect(active).toHaveAccessibleName(expect.stringMatching(new RegExp(`^${ACTIVE}`)));
    expect(inactive?.compareDocumentPosition(deactivate)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(deactivate.compareDocumentPosition(active as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(titles(INACTIVE)).toEqual(['Dice So Nice!', 'EMMA']);
    expect(titles(ACTIVE)).toEqual(['libWrapper']);
  });

  test('counts the modules on each side', () => {
    render(SplitView, { modules: createModules(), canManage: true });

    expect(screen.getByRole('heading', { name: `${INACTIVE} 2` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `${ACTIVE} 1` })).toBeInTheDocument();
  });

  test('moves selected modules across and back', async () => {
    const modules = createModules();
    render(SplitView, { modules, canManage: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('row', { name: /^Dice So Nice!/ }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('row', { name: /^EMMA/ }));
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Activate' }));

    expect(titles(INACTIVE)).toEqual([]);
    expect(titles(ACTIVE)).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
    expect(screen.getByRole('heading', { name: `${ACTIVE} 3` })).toBeInTheDocument();
    expect(screen.getByText('MONDARTH-EMMA.Split.NoneInactive')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Deactivate' }));

    expect(titles(INACTIVE)).toEqual(['Dice So Nice!', 'EMMA']);
    expect(modules.dirty).toBe(false);
  });

  test('says so when no module is active', () => {
    render(SplitView, { modules: createModules({}), canManage: true });

    expect(screen.getByText('MONDARTH-EMMA.Split.NoneActive')).toBeInTheDocument();
    expect(screen.queryByText('MONDARTH-EMMA.Split.NoneInactive')).toBeNull();
  });

  test('says so when every module is active', () => {
    render(SplitView, {
      modules: createModules(Object.fromEntries(ENTRIES.map(({ id }) => [id, true]))),
      canManage: true,
    });

    expect(screen.getByText('MONDARTH-EMMA.Split.NoneInactive')).toBeInTheDocument();
  });

  test('keeps the selections of the two sides apart', async () => {
    render(SplitView, { modules: createModules(), canManage: true });

    await userEvent.click(screen.getByRole('row', { name: /^EMMA/ }));
    await userEvent.click(screen.getByRole('row', { name: /^libWrapper/ }));

    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(2);
  });

  test('lets a user who may not manage modules select, but not move, modules', async () => {
    render(SplitView, { modules: createModules(), canManage: false });

    await userEvent.click(screen.getByRole('row', { name: /^EMMA/ }));

    expect(screen.getByRole('row', { name: /^EMMA/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Activate' })).toBeDisabled();
  });

  test('leaves nothing behind when unmounted', () => {
    const { container, unmount } = render(SplitView, { modules: createModules(), canManage: true });

    unmount();

    expect(container).toBeEmptyDOMElement();
  });
});
