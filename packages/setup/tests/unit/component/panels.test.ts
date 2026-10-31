import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import ModulePanel from '../../../src/component/ModulePanel.svelte';
import SystemPanel from '../../../src/component/SystemPanel.svelte';
import { moduleDetail, systemDetail } from '../../../src/lib/details';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

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

  test('says a world will need a module when next run, as a module it runs now requires it', () => {
    const overview = buildOverview(
      installation({
        worlds: [{ id: 'neme', title: 'Neme', system: 'dnd5e' }],
        modules: [
          installedModule('emma', 'EMMA', '0.9.0', { requires: ['lib-wrapper'] }),
          installedModule('lib-wrapper', 'libWrapper', '1.13.2'),
        ],
      }),
      new Map([['neme', recorded(record('neme', { modules: [{ id: 'emma', title: 'EMMA', version: '0.8.0' }] }))]]),
    );
    render(ModulePanel, { detail: moduleDetail(overview, 'lib-wrapper') });

    const runBy = screen.getByRole('region', { name: 'Run by' });
    expect(within(runBy).getByRole('listitem')).toHaveTextContent(
      'Neme Will need it when next run: it is now required by EMMA, updated since the world last ran.',
    );
  });
});
