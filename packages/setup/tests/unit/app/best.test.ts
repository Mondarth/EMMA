import type { CoreRelease, Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test } from 'vitest';

import { UpdateState } from '../../../src/app/update-state.svelte';
import { buildOverview } from '../../../src/lib/overview';
import { findUpdates } from '../../../src/lib/updates';
import { installation, installedModule, record, recorded, release } from '../../mocks/fixtures';
import { KIT } from '../../mocks/kit';

const build = (version: string): CoreRelease => ({ version, generation: 14, channel: 'stable' });

/**
 * An installation on Foundry 14.368, with 14.369 and 14.370 to be had: D&D 5e 5.3.3, and 6.0.6; Midi 1.0.0, for D&D 5e
 * 5 alone, and 2.0.0, for D&D 5e 6; Library 1.0.0, 2.0.0 and 3.0.0, which needs a build not to be had; and Old 1.0.0,
 * locked in Foundry, with 2.0.0 to be had. A world runs Midi.
 */
const RELEASES: Release[] = [
  release('system:dnd5e', '5.3.3'),
  release('system:dnd5e', '6.0.6'),
  release('module:midi', '1.0.0', { systems: { dnd5e: { minimum: '5.3.0', maximum: '5.9.99' } } }),
  release('module:midi', '2.0.0', { systems: { dnd5e: { minimum: '6.0.6' } } }),
  release('module:lib', '1.0.0'),
  release('module:lib', '2.0.0'),
  // Without a manifest URL of its own, it cannot be installed, so is passed over.
  release('module:lib', '2.5.0', { versionManifest: null }),
  release('module:lib', '3.0.0', { core: { minimum: '15' } }),
  release('module:old', '1.0.0'),
  release('module:old', '2.0.0'),
];

/**
 * The state, searched.
 * @param coreLocked - Whether Foundry VTT is locked in EMMA
 * @returns The state
 */
async function searched(coreLocked = false): Promise<UpdateState> {
  const overview = buildOverview(
    installation({
      worlds: [{ id: 'a', title: 'Alpha', system: 'dnd5e' }],
      modules: [
        installedModule('midi', 'Midi', '1.0.0', { systems: ['dnd5e'] }),
        installedModule('lib', 'Library', '1.0.0'),
        { ...installedModule('old', 'Old', '1.0.0'), locked: true },
      ],
      ...(coreLocked && { coreLocked: true as const }),
    }),
    new Map([['a', recorded(record('a', { modules: [{ id: 'midi', title: 'Midi', version: '1.0.0' }] }))]]),
  );
  const universe = { core: [build('14.368'), build('14.369'), build('14.370')], releases: RELEASES };
  const search = await findUpdates({
    resolver: KIT.resolver,
    badges: KIT.badges,
    overview,
    universe,
    load: () => Promise.resolve([]),
  });
  // Each search finds afresh, as a new one does.
  const updates = new UpdateState(() => Promise.resolve({ ...search }));
  await updates.searchFor(overview);
  return updates;
}

describe('planning the best versions', () => {
  test('plans the newest of everything that works together, leaving what is locked, in place of the plan', async () => {
    const updates = await searched();
    await updates.choose('module:lib', '2.0.0');
    updates.force({ key: 'module:dice', title: 'Dice', version: '1.0.0', manifest: 'https://example.org/dice.json' });

    await expect(updates.planBest()).resolves.toBe(true);

    expect(new Map(updates.picks)).toEqual(
      new Map([
        ['core', '14.370'],
        ['system:dnd5e', '6.0.6'],
        ['module:midi', '2.0.0'],
        ['module:lib', '2.0.0'],
      ]),
    );
    expect(updates.forced).toEqual([]);
    expect(updates.plan.some(({ key }) => key === 'module:old')).toBe(false);
  });

  test('limited to what worlds use, leaves the others as they are, without ignoring them', async () => {
    const updates = await searched();

    await expect(updates.planBest({ inUseOnly: true })).resolves.toBe(true);

    // Library, which no world runs, stays at 1.0.0; Alpha's Midi and D&D 5e move up with Foundry VTT.
    expect(new Map(updates.picks)).toEqual(
      new Map([
        ['core', '14.370'],
        ['system:dnd5e', '6.0.6'],
        ['module:midi', '2.0.0'],
      ]),
    );
    expect(updates.optionOf('module:lib', '2.0.0')).toBeDefined();
  });

  test('keeps Foundry VTT locked in EMMA at its build, updating what runs on it', async () => {
    const updates = await searched(true);

    await expect(updates.planBest()).resolves.toBe(true);

    expect(updates.picks.find(([key]) => key === 'core')).toBeUndefined();
    expect(updates.picks).toContainEqual(['system:dnd5e', '6.0.6']);
  });

  test('changes nothing once a new search has found otherwise meanwhile', async () => {
    const updates = await searched();
    const planning = updates.planBest();
    await updates.searchFor(buildOverview(installation(), new Map()));

    await expect(planning).resolves.toBe(false);
    expect(updates.plan).toEqual([]);
  });

  test('changes nothing while the plan runs, or before the search has found anything', async () => {
    const updates = await searched();
    updates.locked = true;
    await expect(updates.planBest()).resolves.toBe(false);
    expect(updates.plan).toEqual([]);

    await expect(new UpdateState(() => new Promise(() => undefined)).planBest()).resolves.toBe(false);
  });
});
