import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { beforeEach, describe, expect, test } from 'vitest';

import ListView from '@component/ListView.svelte';
import type { ModuleEntry } from '@module/adapters/modules';
import { DrawerFields } from '@module/state/drawer-fields.svelte';
import { ModuleState } from '@module/state/module-state.svelte';
import { moduleEntry } from '../mocks/entries';
import { installFoundryMocks } from '../mocks/foundry';
import { loadedVersions } from '../mocks/versions';
import { createModules } from './fixtures';

/**
 * Build a module entry with relationships to other modules.
 * @param id - The module ID, also used as its title
 * @param relations - The IDs of the modules it requires, recommends and conflicts with
 * @param relations.requires - Modules it requires
 * @param relations.recommends - Modules it recommends
 * @param relations.conflicts - Modules it conflicts with
 * @returns The entry
 */
function related(
  id: string,
  {
    requires = [],
    recommends = [],
    conflicts = [],
  }: Partial<Record<'requires' | 'recommends' | 'conflicts', string[]>> = {},
): ModuleEntry {
  const relations = (ids: string[]) => ids.map(other => ({ id: other, type: 'module' as const, title: other }));
  return moduleEntry({
    id,
    requires,
    relationships: {
      systems: [],
      requires: relations(requires),
      recommends: relations(recommends),
      conflicts: relations(conflicts),
    },
  });
}

/**
 * The list's rows, each as its title, indented two spaces per level of grouping, with its relation icon's label.
 * @returns One line per row
 */
function outline(): string[] {
  return screen.getAllByRole('listitem').map(item => {
    const depth = Number(item.style.getPropertyValue('--emma-depth'));
    const relation = item.querySelector('.emma-module-relation')?.getAttribute('aria-label');
    const title = item.querySelector('.emma-module-title')?.textContent ?? '';
    return `${'  '.repeat(depth)}${title}${relation === undefined ? '' : ` [${relation}]`}`;
  });
}

describe('ListView', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('lists every installed module in display order', () => {
    render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

    const list = screen.getByRole('list', { name: 'MONDARTH-EMMA.List.Label' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map(item => item.querySelector('.emma-module-title')?.textContent);
    expect(titles).toEqual(['Dice So Nice!', 'EMMA', 'libWrapper']);
  });

  test('is titled, with the number of modules active and inactive', async () => {
    const modules = createModules();
    render(ListView, { fields: new DrawerFields(), modules, canManage: true });

    const heading = screen.getByRole('heading', { name: /MONDARTH-EMMA.List.Label/ });
    expect(heading).toHaveTextContent(
      'MONDARTH-EMMA.List.Label MONDARTH-EMMA.Split.Active MONDARTH-EMMA.Count {"count":"1"} MONDARTH-EMMA.Split.Inactive MONDARTH-EMMA.Count {"count":"2"}',
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));

    expect(heading).toHaveTextContent('Active MONDARTH-EMMA.Count {"count":"2"}');
    expect(heading).toHaveTextContent('Inactive MONDARTH-EMMA.Count {"count":"1"}');
  });

  test('shows each module’s version', () => {
    render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

    const dice = screen.getByRole('checkbox', { name: 'Dice So Nice!' }).closest('li') as HTMLElement;
    expect(within(dice).getByText('5.2.4')).toBeInTheDocument();
  });

  test('checks the active modules', () => {
    render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

    expect(screen.getByRole('checkbox', { name: 'libWrapper' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).not.toBeChecked();
  });

  test('stages a change when a module is checked or unchecked', async () => {
    const modules = createModules();
    render(ListView, { fields: new DrawerFields(), modules, canManage: true });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'libWrapper' }));

    expect(modules.changes).toEqual({ emma: true, 'lib-wrapper': false });
    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
  });

  test('toggles a module from its title too', async () => {
    const modules = createModules();
    render(ListView, { fields: new DrawerFields(), modules, canManage: true });

    await userEvent.click(screen.getByText('EMMA'));

    expect(modules.isActive('emma')).toBe(true);
  });

  test('marks modules with a staged change', async () => {
    render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });
    const emma = screen.getByRole('checkbox', { name: 'EMMA' });

    await userEvent.click(emma);
    expect(emma.closest('li')).toHaveClass('changed');

    await userEvent.click(emma);
    expect(emma.closest('li')).not.toHaveClass('changed');
  });

  test('follows changes made elsewhere', async () => {
    const modules = createModules();
    render(ListView, { fields: new DrawerFields(), modules, canManage: true });

    modules.select('inactive', 'dice');
    modules.activateSelected();

    expect(await screen.findByRole('checkbox', { name: 'Dice So Nice!', checked: true })).toBeInTheDocument();
  });

  test('disables the checkboxes for a user who may not manage modules', () => {
    render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: false });

    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'libWrapper' })).toBeChecked();
  });

  describe('drawers', () => {
    const SHOW_DICE = 'MONDARTH-EMMA.Drawer.Show {"module":"Dice So Nice!"}';
    const HIDE_DICE = 'MONDARTH-EMMA.Drawer.Hide {"module":"Dice So Nice!"}';

    test('puts a closed disclosure triangle at the far right of each module', () => {
      render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

      const button = screen.getByRole('button', { name: SHOW_DICE });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button.querySelector('i')).toHaveClass('fa-solid', 'fa-caret-right');
      expect(button.parentElement?.lastElementChild).toBe(button);
      expect(screen.getAllByRole('button')).toHaveLength(3);
    });

    test('opens a drawer below the module, then closes it', async () => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      await userEvent.click(screen.getByRole('button', { name: SHOW_DICE }));

      const button = screen.getByRole('button', { name: HIDE_DICE });
      const drawer = document.getElementById(button.getAttribute('aria-controls') as string) as HTMLElement;
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button.querySelector('i')).toHaveClass('fa-caret-down');
      expect(button.querySelector('i')).not.toHaveClass('fa-caret-right');
      expect(drawer).toHaveTextContent('Rolls 3D dice.');
      expect(button.compareDocumentPosition(drawer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(button.closest('li')).toContainElement(drawer);

      await userEvent.click(button);

      expect(drawer).not.toBeInTheDocument();
      expect(modules.isExpanded('dice')).toBe(false);
    });

    test('does not change the module’s activation', async () => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      await userEvent.click(screen.getByRole('button', { name: SHOW_DICE }));

      expect(modules.dirty).toBe(false);
    });

    test('keeps several drawers open at once', async () => {
      render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

      for (const button of screen.getAllByRole('button')) await userEvent.click(button);

      expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(3);
    });

    test('toggles with the right arrow key from the triangle or the checkbox', async () => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      screen.getByRole('button', { name: SHOW_DICE }).focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(modules.isExpanded('dice')).toBe(true);

      screen.getByRole('checkbox', { name: 'Dice So Nice!' }).focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(modules.isExpanded('dice')).toBe(false);
      expect(modules.dirty).toBe(false);
    });

    test.each(['Alt', 'Control', 'Meta', 'Shift'])('ignores the right arrow key with %s', async modifier => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      screen.getByRole('checkbox', { name: 'Dice So Nice!' }).focus();
      await userEvent.keyboard(`{${modifier}>}{ArrowRight}{/${modifier}}{ArrowLeft}`);

      expect(modules.isExpanded('dice')).toBe(false);
    });

    test('opens for a user who may not manage modules', async () => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: false });

      await userEvent.click(screen.getByRole('button', { name: SHOW_DICE }));

      expect(modules.isExpanded('dice')).toBe(true);
    });
  });

  test('says so when no module is installed', () => {
    render(ListView, { fields: new DrawerFields(), modules: createModules({}, []), canManage: true });

    expect(screen.getByText('MONDARTH-EMMA.List.Empty')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('heading')).toHaveTextContent('Active MONDARTH-EMMA.Count {"count":"0"}');
  });

  describe('related modules', () => {
    // app requires lib and recommends extra; tool requires lib too; rival conflicts with lib.
    const ENTRIES = [
      related('app', { requires: ['lib'], recommends: ['extra'] }),
      related('extra'),
      related('lib'),
      related('rival', { conflicts: ['lib'] }),
      related('tool', { requires: ['lib'] }),
    ];

    test('checking a module checks the modules it requires and groups them under it, required first', async () => {
      const modules = new ModuleState(ENTRIES, {});
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      await userEvent.click(screen.getByRole('checkbox', { name: 'app' }));

      expect(outline()).toEqual([
        'app',
        '  lib [MONDARTH-EMMA.Relation.required]',
        '  extra [MONDARTH-EMMA.Relation.recommended]',
        'rival',
        'tool',
      ]);
      expect(screen.getByRole('checkbox', { name: /lib/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /extra/ })).not.toBeChecked();
    });

    test('marks a grouped module with an information icon whose tooltip names the relation', async () => {
      const modules = new ModuleState(ENTRIES, {});
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      await userEvent.click(screen.getByRole('checkbox', { name: 'app' }));

      const icon = screen.getByRole('img', { name: 'MONDARTH-EMMA.Relation.required' });
      expect(icon).toHaveClass('fa-solid', 'fa-circle-info');
      expect(icon).toHaveAttribute('data-tooltip', 'MONDARTH-EMMA.Relation.required');
      const checkbox = screen.getByRole('checkbox', { name: /lib/ });
      expect(icon.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('repeats a module under each checked module that requires it', () => {
      const modules = new ModuleState(ENTRIES, { app: true, lib: true, tool: true });
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      expect(outline()).toEqual([
        'app',
        '  lib [MONDARTH-EMMA.Relation.required]',
        '  extra [MONDARTH-EMMA.Relation.recommended]',
        'rival',
        'tool',
        '  lib [MONDARTH-EMMA.Relation.required]',
      ]);
    });

    test('every copy of a module changes them all', async () => {
      const modules = new ModuleState(
        [related('app', { recommends: ['extra'] }), related('extra'), related('tool', { recommends: ['extra'] })],
        { app: true, tool: true },
      );
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });
      const [first, second] = screen.getAllByRole('checkbox', { name: /extra/ });

      await userEvent.click(first as HTMLElement);

      expect(second).toBeChecked();
      expect(modules.isActive('extra')).toBe(true);
    });

    test('locks the checkbox of a module a checked module requires, explaining why on hover', async () => {
      const modules = new ModuleState(ENTRIES, {});
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      await userEvent.click(screen.getByRole('checkbox', { name: 'app' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'tool' }));

      const copies = screen.getAllByRole('checkbox', { name: /lib/ });
      expect(copies).toHaveLength(2);
      for (const checkbox of copies) {
        expect(checkbox).toBeChecked();
        expect(checkbox).toBeDisabled();
        expect(checkbox.closest('li')).toHaveClass('locked');
        expect(checkbox.closest('.emma-module-row')).toHaveAttribute(
          'data-tooltip',
          'MONDARTH-EMMA.Requirements.LockedMany {"module":"lib","parents":"app and tool"}',
        );
      }
      expect(screen.getByRole('checkbox', { name: 'app' })).toBeEnabled();
      expect(screen.getByRole('checkbox', { name: 'app' }).closest('.emma-module-row')).not.toHaveAttribute(
        'data-tooltip',
      );
    });

    test('unchecking a module unchecks what was checked for it and returns it to its place', async () => {
      const modules = new ModuleState(ENTRIES, {});
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });
      const app = screen.getByRole('checkbox', { name: 'app' });

      await userEvent.click(app);
      await userEvent.click(app);

      expect(outline()).toEqual(['app', 'extra', 'lib', 'rival', 'tool']);
      expect(modules.dirty).toBe(false);
    });

    test('gives each copy of a module its own drawer', async () => {
      const modules = new ModuleState(ENTRIES, { app: true, lib: true, tool: true });
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });

      modules.toggleExpanded('lib');

      const buttons = await screen.findAllByRole('button', { name: 'MONDARTH-EMMA.Drawer.Hide {"module":"lib"}' });
      const ids = buttons.map(button => button.getAttribute('aria-controls'));
      expect(new Set(ids).size).toBe(2);
      for (const id of ids) expect(document.getElementById(id as string)).toHaveClass('emma-drawer');
    });

    test('marks an unchecked module that conflicts with a checked one in red, with a warning icon', async () => {
      const modules = new ModuleState(ENTRIES, {});
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });
      expect(screen.queryByRole('img', { name: 'MONDARTH-EMMA.Relation.Conflict' })).toBeNull();

      await userEvent.click(screen.getByRole('checkbox', { name: 'app' }));

      const icon = screen.getByRole('img', { name: 'MONDARTH-EMMA.Relation.Conflict' });
      expect(icon).toHaveClass('fa-solid', 'fa-triangle-exclamation');
      expect(icon).toHaveAttribute('data-tooltip', 'MONDARTH-EMMA.Relation.Conflict');
      expect(icon.closest('li')).toHaveClass('conflicted');
      expect(icon.nextElementSibling).toHaveTextContent('rival');
    });
  });

  describe('select-all checkbox', () => {
    const ALL = 'MONDARTH-EMMA.List.All';

    test('sits in the title row, a dash while some modules are active', () => {
      render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

      const all = screen.getByRole<HTMLInputElement>('checkbox', { name: ALL });
      expect(all.closest('h3')).toBe(screen.getByRole('heading'));
      expect(all).toHaveAttribute('data-tooltip', ALL);
      expect(all.indeterminate).toBe(true);
      expect(all).not.toBeChecked();
    });

    test('activates every module from a dash, then deactivates every one, showing each state', async () => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });
      const all = screen.getByRole<HTMLInputElement>('checkbox', { name: ALL });

      await userEvent.click(all);

      expect(modules.allActive).toBe(true);
      expect(all).toBeChecked();
      expect(all.indeterminate).toBe(false);

      await userEvent.click(all);

      expect(modules.noneActive).toBe(true);
      expect(all).not.toBeChecked();
      expect(all.indeterminate).toBe(false);

      await userEvent.click(all);

      expect(modules.allActive).toBe(true);
    });

    test('becomes a dash again when a module is changed by hand', async () => {
      const modules = createModules();
      render(ListView, { fields: new DrawerFields(), modules, canManage: true });
      const all = screen.getByRole<HTMLInputElement>('checkbox', { name: ALL });
      await userEvent.click(all);

      // With every module active, EMMA is grouped under Dice So Nice!, which recommends it.
      await userEvent.click(screen.getByRole('checkbox', { name: /(^| )EMMA$/ }));

      expect(all.indeterminate).toBe(true);
    });

    test('is disabled for a user who may not manage modules, and with nothing installed', () => {
      const { unmount } = render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: false });
      expect(screen.getByRole('checkbox', { name: ALL })).toBeDisabled();
      unmount();

      render(ListView, { fields: new DrawerFields(), modules: createModules({}, []), canManage: true });
      expect(screen.getByRole('checkbox', { name: ALL })).toBeDisabled();
    });
  });

  test('lists every module flat, in display order, when not grouping', () => {
    const modules = new ModuleState(
      [related('app', { requires: ['lib'], recommends: ['extra'] }), related('extra'), related('lib')],
      { app: true, lib: true },
    );
    render(ListView, { fields: new DrawerFields(), modules, canManage: true, grouped: false });

    expect(outline()).toEqual(['app', 'extra', 'lib']);
    // Still locked: grouping only changes how the list is arranged.
    expect(screen.getByRole('checkbox', { name: 'lib' })).toBeDisabled();
  });

  describe('hypothetical versions', () => {
    const CHOOSE = 'MONDARTH-EMMA.Versions.Choose {"module":"libWrapper","version":"1.13.2"}';

    test('replaces the badge of a module with versions to choose by a picker, in the badge’s colours', async () => {
      const { state } = await loadedVersions({ 'lib-wrapper': ['1.13.2', '1.14.0'], emma: ['0.1.0'] });
      render(ListView, { modules: createModules(), canManage: true, fields: new DrawerFields(), versions: state });

      const picker = screen.getByRole('button', { name: CHOOSE });
      expect(picker.querySelector('.emma-badge')).toHaveClass('success');
      // EMMA has only the one version, and Dice So Nice! is not active.
      expect(screen.getAllByRole('button', { name: /^MONDARTH-EMMA\.Versions\.Choose/ })).toHaveLength(1);
    });

    test('shows the version chosen', async () => {
      const { state } = await loadedVersions({ 'lib-wrapper': ['1.13.2', '1.14.0'] }, { bad: ['1.14.0'] });
      render(ListView, { modules: createModules(), canManage: true, fields: new DrawerFields(), versions: state });

      await userEvent.click(screen.getByRole('button', { name: CHOOSE }));
      await userEvent.click(screen.getAllByRole('option')[0] as HTMLElement);

      const picker = screen.getByRole('button', {
        name: 'MONDARTH-EMMA.Versions.Choose {"module":"libWrapper","version":"1.14.0"}',
      });
      expect(picker.querySelector('.emma-badge')).toHaveClass('error');
      expect(picker).toHaveFocus();
    });

    test('shows the badge judged in the setup for a module with no other version, re-judged as the setup changes', async () => {
      const { state } = await loadedVersions(
        { emma: ['0.1.0'] },
        { platforms: { system: ['5.1.0', '5.2.0'] }, bad: ['5.2.0'] },
      );
      render(ListView, { modules: createModules(), canManage: true, fields: new DrawerFields(), versions: state });
      const badge = () =>
        screen.getByText('EMMA', { selector: '.emma-module-title' }).closest('li')?.querySelector('.emma-badge');
      expect(badge()).toHaveAttribute('data-tooltip-html', '0.1.0 success');

      state.choosePlatform('system', '5.2.0');

      await tick();
      expect(badge()).toHaveAttribute('data-tooltip-html', '0.1.0 error');
      // Nothing to choose, so still no picker.
      expect(screen.queryByRole('button', { name: /^MONDARTH-EMMA\.Versions\.Choose \{"module":"EMMA"/ })).toBeNull();
    });

    test('shows the installed badges without them', () => {
      render(ListView, { modules: createModules(), canManage: true, fields: new DrawerFields() });

      expect(screen.queryByRole('button', { name: /^MONDARTH-EMMA\.Versions\.Choose/ })).toBeNull();
    });
  });

  describe('EMMA’s badges', () => {
    const UNUSABLE = { type: 'error' as const, icon: 'fa-solid fa-xmark', tooltip: 'EMMA: unusable', text: 'Unusable' };
    const badgeOf = (title: string) =>
      screen.getByText(title, { selector: '.emma-module-title' }).closest('li')?.querySelector('.emma-badge');

    test('shows the badge EMMA’s checks give a module in place of Foundry’s, and Foundry’s for one they do not', () => {
      render(ListView, {
        modules: createModules(),
        canManage: true,
        fields: new DrawerFields(),
        badges: new Map([['emma', UNUSABLE]]),
      });

      expect(badgeOf('EMMA')).toHaveClass('error');
      // Foundry gives the fixtures no badge.
      expect(badgeOf('libWrapper')).toBeNull();
    });

    test('shows no badge for a module EMMA’s checks give none', () => {
      render(ListView, {
        modules: createModules(),
        canManage: true,
        fields: new DrawerFields(),
        badges: new Map([['emma', null]]),
      });

      expect(badgeOf('EMMA')).toBeNull();
    });

    test('gives way to hypothetical mode’s judgement of the version chosen', async () => {
      const { state } = await loadedVersions({ emma: ['0.1.0'] });
      render(ListView, {
        modules: createModules(),
        canManage: true,
        fields: new DrawerFields(),
        versions: state,
        badges: new Map([['emma', UNUSABLE]]),
      });

      expect(badgeOf('EMMA')).toHaveClass('success');
    });
  });

  describe('with a module hypothetical mode ignores', () => {
    test('greys it out, saying why, and names every row by its module for the context menu', async () => {
      const { state } = await loadedVersions(
        { 'lib-wrapper': ['1.13.2'], dice: ['4.0.0'] },
        undefined,
        undefined,
        new Set(['lib-wrapper']),
      );
      const { container } = render(ListView, {
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
      const { container } = render(ListView, { fields: new DrawerFields(), modules: createModules(), canManage: true });

      expect(container.querySelector('[data-module-id="lib-wrapper"]')).not.toHaveClass('ignored');
      expect(container.querySelector('.ignored')).toBeNull();
    });
  });
});
