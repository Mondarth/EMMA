import { render, screen } from '@testing-library/svelte';
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
      expect(screen.getByRole('toolbar').lastElementChild).toBe(button);
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
            name: 'MONDARTH-EMMA.Versions.Unreached {"packages":"D&D 5e, Dice So Nice!, gone, and other"}',
          }),
        ).not.toHaveClass('failed');
      });
    });
  });
});
