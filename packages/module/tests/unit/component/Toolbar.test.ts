import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import Toolbar from '@component/Toolbar.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';
import { HypotheticalState } from '@module/state/hypothetical.svelte';
import { fakeJudge, loadedVersions } from '../mocks/versions';

const LIST = 'MONDARTH-EMMA.Toolbar.List';
const SPLIT = 'MONDARTH-EMMA.Toolbar.Split';
const EXPAND = 'MONDARTH-EMMA.Toolbar.Expand';
const COLLAPSE = 'MONDARTH-EMMA.Toolbar.Collapse';

describe('Toolbar', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('is a labelled toolbar', () => {
    render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

    expect(screen.getByRole('toolbar', { name: 'MONDARTH-EMMA.Toolbar.Label' })).toBeInTheDocument();
  });

  test('offers the list and split views as icon buttons with tooltips', () => {
    render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

    const list = screen.getByRole('button', { name: LIST });
    const split = screen.getByRole('button', { name: SPLIT });
    expect(list).toHaveClass('icon', 'fa-solid', 'fa-list');
    expect(split).toHaveClass('icon', 'fa-solid', 'fa-table-columns');
    expect(list).toHaveAttribute('data-tooltip', LIST);
    expect(list).toBeEmptyDOMElement();
  });

  test.each([
    ['list', LIST, SPLIT],
    ['split', SPLIT, LIST],
  ] as const)('marks the %s view as pressed', (view, pressed, other) => {
    render(Toolbar, { modules: createModules(), view, onViewChange: vi.fn() });

    expect(screen.getByRole('button', { name: pressed, pressed: true })).toHaveClass('active');
    expect(screen.getByRole('button', { name: other, pressed: false })).not.toHaveClass('active');
  });

  test('reports the view picked', async () => {
    const onViewChange = vi.fn();
    render(Toolbar, { modules: createModules(), view: 'list', onViewChange });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));

    expect(onViewChange).toHaveBeenCalledExactlyOnceWith('split');
  });

  test('follows the view it is given', async () => {
    const { rerender } = render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

    await rerender({ view: 'split' });

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
  });

  describe('expand button', () => {
    test('sits at the far right, after the view buttons', () => {
      render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      const button = screen.getByRole('button', { name: EXPAND });
      const end = screen.getByRole('toolbar').lastElementChild;
      expect(end).toHaveClass('emma-toolbar-end');
      expect(end?.lastElementChild).toBe(button);
      expect(button).toHaveClass('icon', 'fa-solid', 'fa-angles-up');
      expect(button).toHaveAttribute('data-tooltip', EXPAND);
    });

    test('opens every drawer, then closes them all', async () => {
      const modules = createModules();
      render(Toolbar, { modules, view: 'list', onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: EXPAND }));

      expect(modules.allExpanded).toBe(true);
      const collapse = screen.getByRole('button', { name: COLLAPSE });
      expect(collapse).toHaveClass('fa-angles-down');

      await userEvent.click(collapse);

      expect(modules.entries.some(({ id }) => modules.isExpanded(id))).toBe(false);
      expect(screen.getByRole('button', { name: EXPAND })).toBeInTheDocument();
    });

    test('opens the rest when only some drawers are open', async () => {
      const modules = createModules();
      modules.toggleExpanded('emma');
      render(Toolbar, { modules, view: 'list', onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: EXPAND }));

      expect(modules.allExpanded).toBe(true);
    });

    test('follows drawers opened and closed elsewhere', async () => {
      const modules = createModules();
      render(Toolbar, { modules, view: 'list', onViewChange: vi.fn() });

      modules.setAllExpanded(true);

      expect(await screen.findByRole('button', { name: COLLAPSE })).toBeInTheDocument();
    });

    test('is disabled when no module is installed', () => {
      render(Toolbar, { modules: createModules({}, []), view: 'list', onViewChange: vi.fn() });

      expect(screen.getByRole('button', { name: EXPAND })).toBeDisabled();
    });
  });

  describe('grouping toggle', () => {
    const GROUP = 'MONDARTH-EMMA.Toolbar.Group';

    test('is offered in the list view only, to the left of the view buttons', async () => {
      const { rerender } = render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      const group = screen.getByRole('button', { name: GROUP });
      expect(group).toHaveClass('icon', 'fa-solid', 'fa-sitemap');
      expect(group).toHaveAttribute('data-tooltip', GROUP);
      expect(
        group.compareDocumentPosition(screen.getByRole('button', { name: LIST })) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await rerender({ view: 'split' });

      expect(screen.queryByRole('button', { name: GROUP })).toBeNull();
    });

    test.each([true, false])('shows grouping as pressed or not (%s), and asks for the opposite', async grouped => {
      const onGroupedChange = vi.fn();
      render(Toolbar, { modules: createModules(), view: 'list', grouped, onViewChange: vi.fn(), onGroupedChange });
      const group = screen.getByRole('button', { name: GROUP });
      expect(group).toHaveAttribute('aria-pressed', String(grouped));

      await userEvent.click(group);

      expect(onGroupedChange).toHaveBeenCalledExactlyOnceWith(!grouped);
    });

    test('is harmless without a handler', async () => {
      render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: GROUP }));

      expect(screen.getByRole('button', { name: GROUP })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('hypothetical mode', () => {
    const HYPOTHETICAL = 'MONDARTH-EMMA.Toolbar.Hypothetical';
    const CORE = 'MONDARTH-EMMA.Toolbar.CoreTooltip {"version":"14.368"}';
    const SYSTEM = 'MONDARTH-EMMA.Toolbar.SystemTooltip {"title":"D&D 5e","version":"5.1.0"}';
    const platform = { core: '14.368', system: { id: 'dnd5e', title: 'D&D 5e', version: '5.1.0' } };

    test('is not offered without the platform, which only GMs are given', () => {
      render(Toolbar, { modules: createModules(), view: 'list', onViewChange: vi.fn() });

      expect(screen.queryByRole('button', { name: HYPOTHETICAL })).toBeNull();
    });

    test.each(['list', 'split'] as const)('is toggled from the far left of the toolbar in the %s view', view => {
      render(Toolbar, { modules: createModules(), view, platform, onViewChange: vi.fn() });

      const toggle = screen.getByRole('button', { name: HYPOTHETICAL, pressed: false });
      expect(toggle).toHaveClass('icon', 'fa-solid', 'fa-flask');
      expect(toggle).toHaveAttribute('data-tooltip', HYPOTHETICAL);
      expect(screen.getAllByRole('button')[0]).toBe(toggle);
    });

    test('shows no core or system button while off', () => {
      render(Toolbar, { modules: createModules(), view: 'list', platform, onViewChange: vi.fn() });

      expect(screen.queryByRole('button', { name: CORE })).toBeNull();
      expect(screen.queryByRole('button', { name: SYSTEM })).toBeNull();
    });

    test('shows the bare Foundry version and the system ID with its version, right of the toggle, while on', () => {
      render(Toolbar, { modules: createModules(), view: 'list', platform, hypothetical: true, onViewChange: vi.fn() });

      const [toggle, core, system] = screen.getAllByRole('button');
      expect(toggle).toHaveAccessibleName(HYPOTHETICAL);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(toggle).toHaveClass('active');
      expect(core).toHaveTextContent(/^14\.368$/);
      expect(core).toHaveAccessibleName(CORE);
      expect(core).toHaveAttribute('data-tooltip', CORE);
      expect(system).toHaveTextContent('MONDARTH-EMMA.Toolbar.System {"id":"dnd5e","version":"5.1.0"}');
      expect(system).toHaveAccessibleName(SYSTEM);
      expect(system).toHaveAttribute('data-tooltip', SYSTEM);
    });

    test.each([true, false])('asks for the opposite of its state (%s)', async hypothetical => {
      const onHypotheticalChange = vi.fn();
      render(Toolbar, {
        modules: createModules(),
        view: 'list',
        platform,
        hypothetical,
        onViewChange: vi.fn(),
        onHypotheticalChange,
      });

      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));

      expect(onHypotheticalChange).toHaveBeenCalledExactlyOnceWith(!hypothetical);
    });

    test('is harmless without a handler', async () => {
      render(Toolbar, { modules: createModules(), view: 'list', platform, onViewChange: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));

      expect(screen.getByRole('button', { name: HYPOTHETICAL })).toHaveAttribute('aria-pressed', 'false');
    });

    describe('version lookup', () => {
      /**
       * Render the toolbar in hypothetical mode.
       * @param versions - Hypothetical mode's versions
       */
      function renderOn(versions: HypotheticalState): void {
        render(Toolbar, {
          modules: createModules(),
          view: 'list',
          platform,
          hypothetical: true,
          versions,
          onViewChange: vi.fn(),
        });
      }

      test('says nothing before the lookup starts, or once every version was found', async () => {
        renderOn(
          new HypotheticalState(
            () => fakeJudge({}),
            () => [],
          ),
        );
        expect(screen.queryByRole('status')).toBeNull();

        document.body.replaceChildren();
        renderOn((await loadedVersions({})).state);
        expect(screen.queryByRole('status')).toBeNull();
      });

      test('shows a spinner while versions are looked up', async () => {
        const judge = fakeJudge({});
        judge.lookUp.mockReturnValue(new Promise(() => undefined));
        const versions = new HypotheticalState(
          () => judge,
          () => [],
        );
        void versions.load();
        renderOn(versions);

        const status = await screen.findByRole('status', { name: 'MONDARTH-EMMA.Versions.Loading' });
        expect(status).toHaveClass('fa-spinner', 'fa-spin');
      });

      test('warns when the lookup failed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const judge = fakeJudge({});
        judge.lookUp.mockRejectedValue(new Error('offline'));
        const versions = new HypotheticalState(
          () => judge,
          () => [],
        );
        await versions.load();
        renderOn(versions);

        const status = screen.getByRole('status', { name: 'MONDARTH-EMMA.Versions.Failed' });
        expect(status).toHaveClass('fa-triangle-exclamation', 'failed');
        expect(status).toHaveAttribute('data-tooltip', 'MONDARTH-EMMA.Versions.Failed');
      });

      test('names, by title, the packages not every version of which was found', async () => {
        const { state } = await loadedVersions(
          {},
          {
            unreached: [
              { type: 'core', id: 'core' },
              { type: 'system', id: 'dnd5e' },
              { type: 'module', id: 'dice' },
              { type: 'module', id: 'gone' },
              { type: 'system', id: 'other' },
            ],
          },
        );
        renderOn(state);

        expect(
          screen.getByRole('status', {
            name: 'MONDARTH-EMMA.Versions.Unreached {"packages":"MONDARTH-EMMA.Versions.Core, D&D 5e, Dice So Nice!, gone, and other"}',
          }),
        ).not.toHaveClass('failed');
      });

      test('advises setting a proxy only when none is set', async () => {
        const unreached = [{ type: 'module' as const, id: 'dice' }];
        renderOn((await loadedVersions({}, { unreached, proxied: true })).state);
        expect(
          screen.getByRole('status', { name: 'MONDARTH-EMMA.Versions.Unreached {"packages":"Dice So Nice!"}' }),
        ).toHaveAttribute('data-tooltip', 'MONDARTH-EMMA.Versions.Unreached {"packages":"Dice So Nice!"}');

        document.body.replaceChildren();
        renderOn((await loadedVersions({}, { unreached, proxied: false })).state);
        expect(
          screen.getByRole('status', { name: 'MONDARTH-EMMA.Versions.UnreachedNoProxy {"packages":"Dice So Nice!"}' }),
        ).toHaveAttribute('data-tooltip', 'MONDARTH-EMMA.Versions.UnreachedNoProxy {"packages":"Dice So Nice!"}');
      });
    });

    describe('reports', () => {
      const PLAN = 'MONDARTH-EMMA.Report.Reports.plan';
      const CHECK = 'MONDARTH-EMMA.Report.Reports.check';
      const UPDATE = 'MONDARTH-EMMA.Report.Reports.update';

      test('are a group of toggles in the middle of the toolbar: plan, check and update', async () => {
        const { state } = await loadedVersions({});
        render(Toolbar, {
          modules: createModules(),
          view: 'list',
          platform,
          hypothetical: true,
          versions: state,
          onViewChange: vi.fn(),
        });

        const group = screen.getByRole('group', { name: 'MONDARTH-EMMA.Report.Group' });
        expect(group).toHaveClass('emma-toolbar-reports');
        expect(group.previousElementSibling).toHaveClass('emma-toolbar-hypothetical');
        expect(group.nextElementSibling).toHaveClass('emma-toolbar-end');
        const buttons = within(group).getAllByRole('button');
        expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([PLAN, CHECK, UPDATE]);
        expect(buttons.map(button => button.getAttribute('data-tooltip'))).toEqual([
          'MONDARTH-EMMA.Report.Tooltips.plan',
          'MONDARTH-EMMA.Report.Tooltips.check',
          'MONDARTH-EMMA.Report.Tooltips.update',
        ]);
        expect(
          buttons.map(button => [...button.classList].find(name => name.startsWith('fa-') && name !== 'fa-solid')),
        ).toEqual(['fa-list-ol', 'fa-clipboard-check', 'fa-circle-arrow-up']);
        expect(buttons.every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
      });

      test('are offered only in hypothetical mode', () => {
        render(Toolbar, { modules: createModules(), view: 'list', platform, onViewChange: vi.fn() });

        expect(screen.queryByRole('group', { name: 'MONDARTH-EMMA.Report.Group' })).toBeNull();
      });

      test('show pressed those open, and ask for each to be turned on or off', async () => {
        const onReport = vi.fn();
        const { state } = await loadedVersions({});
        render(Toolbar, {
          modules: createModules(),
          view: 'list',
          platform,
          hypothetical: true,
          versions: state,
          reportsOpen: new Set(['check'] as const),
          onViewChange: vi.fn(),
          onReport,
        });

        expect(screen.getByRole('button', { name: CHECK })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: CHECK })).toHaveClass('active');
        expect(screen.getByRole('button', { name: PLAN })).toHaveAttribute('aria-pressed', 'false');
        await userEvent.click(screen.getByRole('button', { name: PLAN }));
        await userEvent.click(screen.getByRole('button', { name: CHECK }));

        expect(onReport.mock.calls).toEqual([['plan'], ['check']]);
      });

      test('are disabled before versions are looked up, except to close one open, and harmless without a handler', async () => {
        render(Toolbar, {
          modules: createModules(),
          view: 'list',
          platform,
          hypothetical: true,
          reportsOpen: new Set(['update'] as const),
          onViewChange: vi.fn(),
        });
        expect(screen.getByRole('button', { name: PLAN })).toBeDisabled();
        expect(screen.getByRole('button', { name: UPDATE })).toBeEnabled();

        document.body.replaceChildren();
        const { state } = await loadedVersions({});
        render(Toolbar, {
          modules: createModules(),
          view: 'list',
          platform,
          hypothetical: true,
          versions: state,
          onViewChange: vi.fn(),
        });
        await userEvent.click(screen.getByRole('button', { name: PLAN }));
        expect(screen.getByRole('button', { name: PLAN })).toBeEnabled();
      });
    });

    describe('core and system versions', () => {
      const CHOOSE_CORE = 'MONDARTH-EMMA.Versions.Choose {"module":"MONDARTH-EMMA.Versions.Core","version":"14.368"}';
      const CHOOSE_SYSTEM = 'MONDARTH-EMMA.Versions.Choose {"module":"D&D 5e","version":"5.1.0"}';

      /**
       * Render the toolbar in hypothetical mode, with the core's and the system's versions given.
       * @param platforms - The core's and the system's versions, the one in use first
       * @returns The state behind it
       */
      async function renderWith(platforms: Parameters<typeof loadedVersions>[1]) {
        const { state, judge } = await loadedVersions({ dice: ['1.0.0'] }, platforms);
        render(Toolbar, {
          modules: createModules(),
          view: 'list',
          platform,
          hypothetical: true,
          versions: state,
          onViewChange: vi.fn(),
        });
        return { state, judge };
      }

      test('keeps plain buttons while no newer version is found', async () => {
        await renderWith({});

        expect(screen.getByRole('button', { name: CORE })).not.toHaveAttribute('aria-haspopup');
        expect(screen.getByRole('button', { name: SYSTEM })).not.toHaveAttribute('aria-haspopup');
      });

      test('offers a list of the newer versions of whichever has one', async () => {
        await renderWith({ platforms: { system: ['5.1.0', '5.2.0'] } });

        expect(screen.getByRole('button', { name: CORE })).not.toHaveAttribute('aria-haspopup');
        const system = screen.getByRole('button', { name: CHOOSE_SYSTEM });
        expect(system).toHaveAttribute('aria-haspopup', 'listbox');
        // It reads as the plain button did, with a caret.
        expect(system).toHaveTextContent('MONDARTH-EMMA.Toolbar.System {"id":"dnd5e","version":"5.1.0"}');
        expect(system).not.toHaveClass('bare');
        expect(system.querySelector('.fa-caret-down')).not.toBeNull();
      });

      test('lists each version in the colour of its fit, and shows the version chosen', async () => {
        const { judge } = await renderWith({
          platforms: { core: ['14.368', '14.370'], system: ['5.1.0', '5.2.0'] },
          bad: ['14.370'],
        });

        await userEvent.click(screen.getByRole('button', { name: CHOOSE_CORE }));
        const [option] = screen.getAllByRole('option');
        expect(option).toHaveTextContent('14.370');
        expect(option?.querySelector('.emma-badge')).toHaveClass('error');
        expect(judge.judgePlatform.mock.lastCall?.[2]).toBe('core');
        await userEvent.click(option as HTMLElement);

        const core = screen.getByRole('button', {
          name: 'MONDARTH-EMMA.Versions.Choose {"module":"MONDARTH-EMMA.Versions.Core","version":"14.370"}',
        });
        expect(core).toHaveTextContent(/^14\.370$/);

        await userEvent.click(screen.getByRole('button', { name: CHOOSE_SYSTEM }));
        await userEvent.click(screen.getByRole('option', { name: /5\.2\.0/ }));

        expect(
          screen.getByRole('button', { name: 'MONDARTH-EMMA.Versions.Choose {"module":"D&D 5e","version":"5.2.0"}' }),
        ).toHaveTextContent('MONDARTH-EMMA.Toolbar.System {"id":"dnd5e","version":"5.2.0"}');
      });

      /**
       * The versions a picker's list offers, read from the list its button opens.
       * @param button - The picker's button
       * @returns Each option's version
       */
      function offered(button: HTMLElement): string[] {
        const list = document.getElementById(button.getAttribute('aria-controls') ?? '');
        if (list === null) throw new Error('The button opens no list');
        return within(list)
          .queryAllByRole('option', { hidden: true })
          .map(option => option.textContent.trim().split(' ')[0] ?? '');
      }

      // Once a newer version is chosen, its list must offer the one in use, to go back to, and leave out the one chosen.
      test('lists the version in use once another is chosen, and leaves out the one chosen', async () => {
        await renderWith({ platforms: { core: ['14.368', '14.370'], system: ['5.1.0', '5.2.0', '6.0.0'] } });
        const chooseSystem = (version: string) =>
          screen.getByRole('button', {
            name: `MONDARTH-EMMA.Versions.Choose {"module":"D&D 5e","version":"${version}"}`,
          });
        const chooseCore = (version: string) =>
          screen.getByRole('button', {
            name: `MONDARTH-EMMA.Versions.Choose {"module":"MONDARTH-EMMA.Versions.Core","version":"${version}"}`,
          });

        await userEvent.click(chooseSystem('5.1.0'));
        expect(offered(chooseSystem('5.1.0'))).toEqual(['6.0.0', '5.2.0']);
        await userEvent.click(screen.getByRole('option', { name: /6\.0\.0/ }));
        await userEvent.click(chooseSystem('6.0.0'));
        expect(offered(chooseSystem('6.0.0'))).toEqual(['5.2.0', '5.1.0']);
        await userEvent.keyboard('{Escape}');

        await userEvent.click(chooseCore('14.368'));
        await userEvent.click(screen.getByRole('option', { name: /14\.370/ }));
        await userEvent.click(chooseCore('14.370'));
        expect(offered(chooseCore('14.370'))).toEqual(['14.368']);
      });
    });
  });
});
