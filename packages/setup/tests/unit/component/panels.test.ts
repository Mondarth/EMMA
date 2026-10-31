import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import ModulePanel from '../../../src/component/ModulePanel.svelte';
import RootPanel from '../../../src/component/RootPanel.svelte';
import SystemPanel from '../../../src/component/SystemPanel.svelte';
import WorldPanel from '../../../src/component/WorldPanel.svelte';
import { moduleDetail, systemDetail } from '../../../src/lib/details';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(
  installation({
    modules: [installedModule('app', 'App', '2.0.0', { systems: ['dnd5e', 'pf2e'], requires: ['gone'] })],
  }),
  new Map(),
);

/** Neme last ran EMMA 0.8.0, and D&D 5e 4.0.0; EMMA 0.9.0, installed now, requires libWrapper. */
const NEME = buildOverview(
  installation({
    worlds: [{ id: 'neme', title: 'Neme', system: 'dnd5e' }],
    modules: [
      installedModule('emma', 'EMMA', '0.9.0', { requires: ['lib-wrapper'] }),
      installedModule('lib-wrapper', 'libWrapper', '1.13.2'),
    ],
  }),
  new Map([
    [
      'neme',
      recorded(
        record('neme', {
          system: { id: 'dnd5e', title: 'D&D 5e', version: '4.0.0' },
          modules: [{ id: 'emma', title: 'EMMA', version: '0.8.0' }],
        }),
      ),
    ],
  ]),
);

describe('SystemPanel', () => {
  test('notes a world that last ran with another version of a game system', () => {
    render(SystemPanel, { detail: systemDetail(NEME, 'dnd5e', 'neme') });

    expect(screen.getByText('In Neme')).toBeInTheDocument();
    expect(screen.getByText('Last ran with').nextElementSibling).toHaveTextContent('4.0.0');
    expect(screen.getByText('Installed', { selector: 'dt' }).nextElementSibling).toHaveClass('emma-status-other');
    expect(within(screen.getByRole('region', { name: 'Worlds' })).getByRole('listitem')).toHaveTextContent(
      'Neme last ran with 4.0.0 Another version installed',
    );
  });

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
    render(ModulePanel, { detail: moduleDetail(NEME, 'lib-wrapper') });

    const activeIn = screen.getByRole('region', { name: 'Active in' });
    expect(within(activeIn).getByRole('listitem')).toHaveTextContent(
      'Neme Will need it when next run: it is now required by EMMA, updated since the world last ran.',
    );
  });
});

describe('WorldPanel', () => {
  test('lists the modules a world will need when next run', () => {
    render(WorldPanel, { world: NEME.worlds[0] as (typeof NEME.worlds)[number] });

    expect(
      within(screen.getByRole('region', { name: 'Will need when next run' })).getByRole('listitem'),
    ).toHaveTextContent('libWrapper: now required by EMMA, updated since the world last ran');
  });
});

describe('WorldPanel, when a module a world will need is not installed', () => {
  test('marks it', () => {
    const overview = buildOverview(
      installation({
        worlds: [{ id: 'neme', title: 'Neme', system: 'dnd5e' }],
        modules: [installedModule('emma', 'EMMA', '0.9.0', { requires: ['gone'] })],
      }),
      new Map([['neme', recorded(record('neme', { modules: [{ id: 'emma', title: 'EMMA', version: '0.8.0' }] }))]]),
    );
    render(WorldPanel, { world: overview.worlds[0] as (typeof overview.worlds)[number] });

    expect(
      within(screen.getByRole('region', { name: 'Will need when next run' })).getByRole('listitem'),
    ).toHaveTextContent('gone: now required by EMMA, updated since the world last ran Not installed');
  });
});

describe('RootPanel', () => {
  test('counts the modules a world will need when next run as active in it, and says so', () => {
    render(RootPanel, { overview: NEME, guardOn: true, onGuardChange: () => undefined });

    expect(screen.getByText('Active in a recorded world').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText(/^Of those, 1 only when next run/)).toBeInTheDocument();
  });
});
