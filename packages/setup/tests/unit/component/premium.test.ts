import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import InstallSection from '../../../src/component/InstallSection.svelte';
import WhyChosen from '../../../src/component/WhyChosen.svelte';
import type { ListedPackage } from '../../../src/foundry/setup-game';
import { DEFAULT_FILTERS } from '../../../src/lib/install';
import { buildOverview } from '../../../src/lib/overview';
import type { Planner } from '../../../src/lib/plans';
import type { PackageUpdate } from '../../../src/lib/updates';
import { alone, installation, installedModule, release, unjudged } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(installation({ modules: [installedModule('app', 'App', '1.0.0')] }), new Map());
const APP: PackageUpdate = { key: 'module:app', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };

describe("an update's panel, where the update needs premium content the user does not own", () => {
  test('says the version is not planned, naming what to buy, and the way the plan comes to need it', async () => {
    const base = alone(APP);
    const planner: Planner = {
      ...base,
      plan: async picks => [
        ...((await base.plan(picks)) ?? []),
        { key: 'module:premium', version: '1.0.0', by: { package: 'module:app', version: '2.0.0' } },
      ],
    };
    const updates = new UpdateState(() =>
      Promise.resolve({
        updates: new Map([[APP.key, APP]]),
        blocked: new Map(),
        unresolved: [],
        judge: unjudged,
        planner,
      }),
    );
    await updates.searchFor(OVERVIEW);
    updates.knowListing([{ type: 'module', id: 'premium', title: 'Premium Maps', unowned: true }]);
    render(WhyChosen, { updates, key: 'module:app' });
    expect(screen.queryByRole('alert')).toBeNull();

    await updates.choose('module:app', '2.0.0');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('2.0.0 is not planned: it needs premium content you do not own');
    expect(within(alert).getByRole('listitem')).toHaveTextContent('App → Premium Maps');
    // Without a way to ask Foundry again, no button to.
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  test('asks Foundry again what the user owns, once bought, from the refusal', async () => {
    const base = alone(APP);
    const planner: Planner = {
      ...base,
      plan: async picks => [
        ...((await base.plan(picks)) ?? []),
        { key: 'module:premium', version: '1.0.0', by: { package: 'module:app', version: '2.0.0' } },
      ],
    };
    const updates = new UpdateState(() =>
      Promise.resolve({
        updates: new Map([[APP.key, APP]]),
        blocked: new Map(),
        unresolved: [],
        judge: unjudged,
        planner,
      }),
    );
    await updates.searchFor(OVERVIEW);
    updates.knowListing([{ type: 'module', id: 'premium', title: 'Premium Maps', unowned: true }]);
    updates.recheckOwned = vi.fn(() => {
      updates.forgetPremiumRefusals();
      updates.knowListing([{ type: 'module', id: 'premium', title: 'Premium Maps', unowned: false }]);
      return Promise.resolve();
    });
    render(WhyChosen, { updates, key: 'module:app' });
    await updates.choose('module:app', '2.0.0');
    const alert = await screen.findByRole('alert');

    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Check what I own again' }));

    expect(updates.recheckOwned).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    await expect(updates.choose('module:app', '2.0.0')).resolves.toBe(true);
  });
});

describe('the Install section, where a module needs premium content the user does not own', () => {
  const NEW_URL = 'https://example.org/new/module.json';
  const listed: ListedPackage = {
    type: 'module',
    id: 'new',
    title: 'New',
    version: '1.0.0',
    compatibility: {},
    systems: [],
    unowned: false,
    manifest: NEW_URL,
  };

  /**
   * The state, searched, with a planner that installs New with Premium Maps, which the user does not own until
   * Foundry is asked again; and the Install section, showing New.
   * @returns The state, and how to ask Foundry again
   */
  async function shown() {
    const base = alone(APP);
    const known = new Set<string>();
    const planner: Planner = {
      ...base,
      add: key => {
        known.add(key);
        return Promise.resolve(true);
      },
      include: () => undefined,
      candidates: key => (known.has(key) ? ['1.0.0'] : base.candidates(key)),
      plan: async picks => [
        ...((await base.plan(picks)) ?? []).map(({ installed: _none, ...entry }) => entry),
        ...(picks.has('module:new')
          ? [{ key: 'module:premium', version: '1.0.0', by: { package: 'module:new', version: '1.0.0' } }]
          : []),
      ],
    };
    const updates = new UpdateState(() =>
      Promise.resolve({
        updates: new Map([[APP.key, APP]]),
        blocked: new Map(),
        unresolved: [],
        judge: unjudged,
        planner,
        readManifest: () =>
          Promise.resolve({ ok: true as const, release: release('module:new', '1.0.0'), title: 'New' }),
      }),
    );
    await updates.searchFor(OVERVIEW);
    updates.knowListing([{ type: 'module', id: 'premium', title: 'Premium Maps', unowned: true }]);
    const recheckOwned = vi.fn(() => {
      updates.knowListing([{ type: 'module', id: 'premium', title: 'Premium Maps', unowned: false }]);
      return Promise.resolve();
    });
    updates.recheckOwned = recheckOwned;
    render(InstallSection, {
      type: 'module',
      listing: [listed],
      packages: [listed],
      filters: DEFAULT_FILTERS,
      updates,
      onShow: vi.fn(),
      onFilter: vi.fn(),
    });
    return { updates, recheckOwned, section: screen.getByRole('region', { name: 'Install a module' }) };
  }

  test('offers to ask Foundry again once ticking it is refused, then lets it be ticked', async () => {
    const { recheckOwned, section } = await shown();
    const user = userEvent.setup();
    const box = within(section).getByRole('checkbox', { name: 'Install New' });

    await user.click(box);
    const recheck = await within(section).findByRole('button', { name: 'Check what I own again' });
    expect(section).toHaveTextContent('It needs premium content you do not own');

    await user.click(recheck);
    expect(recheckOwned).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(section).not.toHaveTextContent('It needs premium content you do not own');
    });
    await user.click(box);
    await vi.waitFor(() => {
      expect(box).toBeChecked();
    });
  });

  test('offers the same where adding it by its manifest URL is refused', async () => {
    const { recheckOwned, section } = await shown();
    const user = userEvent.setup();

    await user.type(within(section).getByRole('textbox', { name: 'Manifest URL' }), `${NEW_URL}{Enter}`);
    const refused = await within(section).findByRole('alert');
    expect(refused).toHaveTextContent('It needs premium content you do not own');

    await user.click(within(refused).getByRole('button', { name: 'Check what I own again' }));
    expect(recheckOwned).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(within(section).queryByRole('alert')).toBeNull();
    });
  });
});
