import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import EmmaRoot from '@component/EmmaRoot.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { createModules } from './fixtures';
import { fakeJudge } from '../mocks/versions';
import { DrawerFields } from '@module/state/drawer-fields.svelte';

const onSave = () => Promise.resolve();
const LIST = 'MONDARTH-EMMA.Toolbar.List';
const SPLIT = 'MONDARTH-EMMA.Toolbar.Split';
const GROUP = 'MONDARTH-EMMA.Toolbar.Group';
const HYPOTHETICAL = 'MONDARTH-EMMA.Toolbar.Hypothetical';

describe('EmmaRoot', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('shows the toolbar above the main pane', () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
    });

    const toolbar = screen.getByRole('toolbar');
    const list = screen.getByRole('list');
    expect(toolbar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('starts in the list view when asked to', () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
    });

    expect(screen.getByRole('button', { name: LIST })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'MONDARTH-EMMA.List.Label' })).toBeInTheDocument();
  });

  test('starts in the split view when asked to', () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'split',
      initialGrouped: true,
      canManage: true,
      onSave,
    });

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('treegrid')).toHaveLength(2);
    expect(screen.queryByRole('list')).toBeNull();
  });

  test('switches between the views and reports each switch', async () => {
    const onViewChange = vi.fn();
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
      onViewChange,
    });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));
    expect(screen.getAllByRole('treegrid')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: LIST }));
    expect(screen.getByRole('list')).toBeInTheDocument();

    expect(onViewChange.mock.calls).toEqual([['split'], ['list']]);
  });

  test('does not report picking the view already shown', async () => {
    const onViewChange = vi.fn();
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
      onViewChange,
    });

    await userEvent.click(screen.getByRole('button', { name: LIST }));

    expect(onViewChange).not.toHaveBeenCalled();
  });

  test('switches view without anyone listening', async () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
    });

    await userEvent.click(screen.getByRole('button', { name: SPLIT }));

    expect(screen.getByRole('button', { name: SPLIT })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps staged changes across view switches', async () => {
    const modules = createModules();
    render(EmmaRoot, { fields: new DrawerFields(), modules, initialView: 'list', canManage: true, onSave });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('button', { name: SPLIT }));
    await userEvent.click(screen.getByRole('button', { name: LIST }));

    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
    expect(modules.changes).toEqual({ emma: true });
  });

  test('keeps changes staged in the split view when switching to the list view', async () => {
    const modules = createModules();
    render(EmmaRoot, { fields: new DrawerFields(), modules, initialView: 'split', canManage: true, onSave });

    await userEvent.click(screen.getByRole('row', { name: /EMMA/ }));
    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Split.Activate' }));
    await userEvent.click(screen.getByRole('button', { name: LIST }));

    expect(screen.getByRole('checkbox', { name: 'EMMA' })).toBeChecked();
  });

  test('shows the footer below the main pane', () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
    });

    const list = screen.getByRole('list');
    const save = screen.getByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' });
    expect(list.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('saves through the callback it is given', async () => {
    const modules = createModules();
    const save = vi.fn(() => Promise.resolve());
    render(EmmaRoot, { fields: new DrawerFields(), modules, initialView: 'list', canManage: true, onSave: save });

    await userEvent.click(screen.getByRole('checkbox', { name: 'EMMA' }));
    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' }));

    expect(save).toHaveBeenCalledOnce();
  });

  test.each(['list', 'split'] as const)('is read-only in the %s view for a user who may not manage modules', view => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: view,
      canManage: false,
      onSave,
    });

    expect(screen.getByText('MONDARTH-EMMA.Footer.ReadOnly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MONDARTH-EMMA.Footer.Save' })).toBeNull();
  });

  test('leaves nothing behind when unmounted', () => {
    const { container, unmount } = render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
    });

    unmount();

    expect(container).toBeEmptyDOMElement();
  });

  test('turns the list view’s grouping on and off from the toolbar, reporting each change', async () => {
    const onGroupedChange = vi.fn();
    // Dice So Nice! requires libWrapper, and is active, so libWrapper is grouped under it.
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules({ dice: true, 'lib-wrapper': true }),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
      onGroupedChange,
    });
    const group = screen.getByRole('button', { name: GROUP });
    expect(group).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('img', { name: 'MONDARTH-EMMA.Relation.required' })).toHaveLength(1);

    await userEvent.click(group);

    expect(onGroupedChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(group).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('img', { name: 'MONDARTH-EMMA.Relation.required' })).toBeNull();
  });

  test('starts with the list flat when asked to', () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules({ dice: true, 'lib-wrapper': true }),
      initialView: 'list',
      initialGrouped: false,
      canManage: true,
      onSave,
    });

    expect(screen.getByRole('button', { name: GROUP })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('img', { name: 'MONDARTH-EMMA.Relation.required' })).toBeNull();
  });

  test('turns hypothetical mode on and off, starting off', async () => {
    render(EmmaRoot, {
      fields: new DrawerFields(),
      modules: createModules(),
      initialView: 'list',
      initialGrouped: true,
      canManage: true,
      onSave,
      platform: { core: '14.368', system: { id: 'dnd5e', title: 'D&D 5e', version: '5.1.0' } },
    });
    const toggle = screen.getByRole('button', { name: HYPOTHETICAL });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^MONDARTH-EMMA\.Toolbar\.Core/ })).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.queryByRole('button', { name: /^MONDARTH-EMMA\.Toolbar\.Core/ })).toBeNull();
  });

  describe('hypothetical versions', () => {
    const CHOOSE = /^MONDARTH-EMMA\.Versions\.Choose/;
    const NO_PROXY = 'MONDARTH-EMMA.Footer.NoProxy';

    /**
     * Render the root for a GM. libWrapper, the one module active, and Dice So Nice! have newer versions.
     * @param view - The view to show
     * @param options - As for {@link fakeJudge}
     * @returns The judge behind the versions, and the function setting it up
     */
    function renderForGM(view: 'list' | 'split' = 'list', options?: Parameters<typeof fakeJudge>[1]) {
      const judge = fakeJudge({ 'lib-wrapper': ['1.13.2', '1.14.0'], dice: ['5.2.4', '5.3.0'] }, options);
      const createVersionJudge = vi.fn(() => judge);
      render(EmmaRoot, {
        fields: new DrawerFields(),
        modules: createModules(),
        initialView: view,
        initialGrouped: true,
        canManage: true,
        onSave,
        platform: { core: '14.368', system: { id: 'dnd5e', title: 'D&D 5e', version: '5.1.0' } },
        createVersionJudge,
      });
      return { judge, createVersionJudge };
    }

    test('looks the modules staged active up only once hypothetical mode is turned on', async () => {
      const { judge, createVersionJudge } = renderForGM();
      expect(createVersionJudge).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));

      expect(judge.lookUp).toHaveBeenCalledExactlyOnceWith(['lib-wrapper']);
      expect(await screen.findAllByRole('button', { name: CHOOSE })).toHaveLength(1);
    });

    test('explains in the footer, while the mode is on, what is not looked up without a proxy', async () => {
      renderForGM('list', { proxied: false });
      const footer = () => screen.getByRole('contentinfo');
      expect(footer()).not.toHaveTextContent(NO_PROXY);

      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));
      expect(footer()).toHaveTextContent(NO_PROXY);

      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));
      expect(footer()).not.toHaveTextContent(NO_PROXY);
    });

    test('says nothing of a proxy when one is set', async () => {
      renderForGM();

      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));

      expect(screen.getByRole('contentinfo')).not.toHaveTextContent(NO_PROXY);
    });

    test('re-judges the modules when the system is changed', async () => {
      const { judge } = renderForGM('list', { platforms: { system: ['5.1.0', '5.2.0'] } });
      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));
      const system = await screen.findByRole('button', {
        name: 'MONDARTH-EMMA.Versions.Choose {"module":"D&D 5e","version":"5.1.0"}',
      });

      await userEvent.click(system);
      await userEvent.click(screen.getByRole('option', { name: /5\.2\.0/ }));

      expect(judge.judgeChoices.mock.lastCall?.[1]).toMatchObject({ system: '5.2.0' });
      // libWrapper's badge is judged again, in the setup with the system chosen.
      expect(
        screen.getByRole('button', {
          name: 'MONDARTH-EMMA.Versions.Choose {"module":"libWrapper","version":"1.13.2"}',
        }),
      ).toBeInTheDocument();
    });

    test('looks a module up when it is staged active, and judges the setup it makes', async () => {
      const { judge } = renderForGM();
      await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));
      await screen.findByRole('button', { name: CHOOSE });

      await userEvent.click(screen.getByRole('checkbox', { name: 'Dice So Nice!' }));

      await vi.waitFor(() => {
        expect(judge.lookUp).toHaveBeenLastCalledWith(['dice']);
      });
      expect(await screen.findAllByRole('button', { name: CHOOSE })).toHaveLength(2);
      expect([...(judge.judgeChoices.mock.lastCall?.[0] ?? [])].sort()).toEqual(['dice', 'lib-wrapper']);

      await userEvent.click(screen.getByRole('checkbox', { name: 'Dice So Nice!' }));

      await vi.waitFor(() => {
        expect(screen.getAllByRole('button', { name: CHOOSE })).toHaveLength(1);
      });
      expect(judge.lookUp).toHaveBeenCalledTimes(2);
    });

    test.each(['list', 'split'] as const)(
      're-judges the other modules when one is staged active, then inactive, in the %s view',
      async view => {
        // libWrapper is judged unusable without Dice So Nice! in the setup.
        const judge = fakeJudge(
          { 'lib-wrapper': ['1.13.2', '1.14.0'], dice: ['5.2.4'] },
          { needs: { 'lib-wrapper': 'dice' } },
        );
        const modules = createModules();
        render(EmmaRoot, {
          fields: new DrawerFields(),
          modules,
          initialView: view,
          initialGrouped: true,
          canManage: true,
          onSave,
          platform: { core: '14.368', system: { id: 'dnd5e', title: 'D&D 5e', version: '5.1.0' } },
          createVersionJudge: () => judge,
        });
        const badge = async () =>
          (await screen.findByRole('button', { name: CHOOSE })).querySelector('.emma-badge')?.className ?? '';
        await userEvent.click(screen.getByRole('button', { name: HYPOTHETICAL }));
        expect(await badge()).toMatch(/\berror\b/);

        modules.setActive('dice', true);

        await vi.waitFor(async () => {
          expect(await badge()).toMatch(/\bsuccess\b/);
        });

        modules.setActive('dice', false);

        await vi.waitFor(async () => {
          expect(await badge()).toMatch(/\berror\b/);
        });
      },
    );

    test.each(['list', 'split'] as const)('offers versions in the %s view only while the mode is on', async view => {
      const { createVersionJudge, judge } = renderForGM(view);
      const toggle = screen.getByRole('button', { name: HYPOTHETICAL });

      await userEvent.click(toggle);
      expect(await screen.findByRole('button', { name: CHOOSE })).toBeInTheDocument();

      await userEvent.click(toggle);
      expect(screen.queryByRole('button', { name: CHOOSE })).toBeNull();

      await userEvent.click(toggle);
      expect(await screen.findByRole('button', { name: CHOOSE })).toBeInTheDocument();
      // The versions found are kept while the window is open.
      expect(createVersionJudge).toHaveBeenCalledOnce();
      expect(judge.lookUp).toHaveBeenCalledOnce();
    });
  });
});
