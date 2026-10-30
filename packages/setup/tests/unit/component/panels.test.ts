import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import ModulePanel from '../../../src/component/ModulePanel.svelte';
import SystemPanel from '../../../src/component/SystemPanel.svelte';
import { moduleDetail, systemDetail } from '../../../src/lib/details';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    modules: [installedModule('app', 'App', '2.0.0', { systems: ['dnd5e', 'pf2e'], requires: ['gone'] })],
  }),
  new Map(),
);

describe('SystemPanel', () => {
  test('says when no world uses a game system', () => {
    render(SystemPanel, { detail: systemDetail(OVERVIEW, 'dnd5e') });

    expect(screen.getByText('No world uses this game system.')).toBeInTheDocument();
    expect(screen.getByText('Modules for it').nextElementSibling).toHaveTextContent('1');
  });
});

describe('ModulePanel', () => {
  test('marks the game systems and modules a module names that are not installed', () => {
    render(ModulePanel, { detail: moduleDetail(OVERVIEW, 'app') });

    const systems = screen.getByText('Game systems', { selector: 'dt' }).nextElementSibling as HTMLElement;
    expect(
      within(systems)
        .getAllByRole('listitem')
        .map(item => item.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['D&D 5e', 'pf2e Not installed']);
    const requires = screen.getByRole('region', { name: 'Requires' });
    expect(within(requires).getByRole('listitem')).toHaveTextContent('gone Not installed');
  });
});
