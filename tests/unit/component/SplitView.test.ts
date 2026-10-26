import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import SplitView from '@component/SplitView.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules, ENTRIES } from './fixtures';
import { DrawerFields } from '@module/state/drawer-fields.svelte';
import { loadedVersions } from '../mocks/versions';

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
    render(SplitView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

    const [inactive, active] = screen.getAllByRole('treegrid');
    const deactivate = screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Deactivate' });
    expect(inactive).toHaveAccessibleName(expect.stringMatching(new RegExp(`^${INACTIVE}`)));
    expect(active).toHaveAccessibleName(expect.stringMatching(new RegExp(`^${ACTIVE}`)));
    expect(inactive?.compareDocumentPosition(deactivate)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(deactivate.compareDocumentPosition(active as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(titles(INACTIVE)).toEqual(['Dice So Nice!', 'EMMA']);
    expect(titles(ACTIVE)).toEqual(['libWrapper']);
  });

  test('counts the modules on each side, in parentheses just after the title', () => {
    render(SplitView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

    const heading = screen.getByRole('heading', { name: new RegExp(`^${INACTIVE}`) });
    expect(heading.firstChild?.textContent?.trim()).toBe(INACTIVE);
    expect(heading.querySelector('.emma-split-count')).toBe(heading.lastElementChild);

    expect(screen.getByRole('heading', { name: `${INACTIVE} MONDARTH-EMMA.Count {"count":"2"}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `${ACTIVE} MONDARTH-EMMA.Count {"count":"1"}` })).toBeInTheDocument();
  });

  test('moves selected modules across and back', async () => {
    const modules = createModules();
    render(SplitView, { fields: new DrawerFields(), modules, canManage: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('row', { name: /^Dice So Nice!/ }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('row', { name: /^EMMA/ }));
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Activate' }));

    expect(titles(INACTIVE)).toEqual([]);
    // The modules moved stay selected, so Dice So Nice! has libWrapper, which it requires, and EMMA, which it
    // recommends, grouped under it.
    expect(titles(ACTIVE)).toEqual(['Dice So Nice!', 'libWrapper', 'EMMA']);
    expect(screen.getByRole('heading', { name: `${ACTIVE} MONDARTH-EMMA.Count {"count":"3"}` })).toBeInTheDocument();
    expect(screen.getByText('MONDARTH-EMMA.Split.NoneInactive')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Deactivate' }));

    expect(titles(INACTIVE)).toEqual(['Dice So Nice!', 'EMMA']);
    expect(modules.dirty).toBe(false);
  });

  test('says so when no module is active', () => {
    render(SplitView, { fields: new DrawerFields(), modules: createModules({}), canManage: true });

    expect(screen.getByText('MONDARTH-EMMA.Split.NoneActive')).toBeInTheDocument();
    expect(screen.queryByText('MONDARTH-EMMA.Split.NoneInactive')).toBeNull();
  });

  test('says so when every module is active', () => {
    render(SplitView, {
      fields: new DrawerFields(),
      modules: createModules(Object.fromEntries(ENTRIES.map(({ id }) => [id, true]))),
      canManage: true,
    });

    expect(screen.getByText('MONDARTH-EMMA.Split.NoneInactive')).toBeInTheDocument();
  });

  test('keeps the selections of the two sides apart', async () => {
    render(SplitView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

    await userEvent.click(screen.getByRole('row', { name: /^EMMA/ }));
    await userEvent.click(screen.getByRole('row', { name: /^libWrapper/ }));

    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(2);
  });

  test('lets a user who may not manage modules select, but not move, modules', async () => {
    render(SplitView, { fields: new DrawerFields(), modules: createModules(), canManage: false });

    await userEvent.click(screen.getByRole('row', { name: /^EMMA/ }));

    expect(screen.getByRole('row', { name: /^EMMA/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Activate' })).toBeDisabled();
  });

  test('leaves nothing behind when unmounted', () => {
    const { container, unmount } = render(SplitView, {
      fields: new DrawerFields(),
      modules: createModules(),
      canManage: true,
    });

    unmount();

    expect(container).toBeEmptyDOMElement();
  });

  describe('with a module hypothetical mode ignores', () => {
    test('greys it out, saying why, and names every row by its module for the context menu', async () => {
      const { state } = await loadedVersions(
        { 'lib-wrapper': ['1.13.2'], dice: ['4.0.0'] },
        undefined,
        undefined,
        new Set(['lib-wrapper']),
      );
      const { container } = render(SplitView, {
        fields: new DrawerFields(),
        modules: createModules(),
        canManage: true,
        versions: state,
      });

      const ignored = container.querySelector('[data-module-id="lib-wrapper"]');
      expect(ignored).toHaveClass('ignored');
      expect(container.querySelector('[data-tooltip="MONDARTH-EMMA.Ignore.Tooltip"]')).not.toBeNull();
      expect(container.querySelector('[data-module-id="dice"]')).not.toHaveClass('ignored');
    });

    test('shows it as usual while hypothetical mode is off', () => {
      const { container } = render(SplitView, {
        fields: new DrawerFields(),
        modules: createModules(),
        canManage: true,
      });

      expect(container.querySelector('[data-module-id="lib-wrapper"]')).not.toHaveClass('ignored');
      expect(container.querySelector('.ignored')).toBeNull();
    });
  });
});
