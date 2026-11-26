import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import WhyChosen from '../../../src/component/WhyChosen.svelte';
import { buildOverview } from '../../../src/lib/overview';
import type { Planner } from '../../../src/lib/plans';
import type { PackageUpdate } from '../../../src/lib/updates';
import { alone, installation, installedModule, unjudged } from '../../mocks/fixtures';

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
  });
});
