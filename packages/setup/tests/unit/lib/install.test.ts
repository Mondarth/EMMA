import { describe, expect, test } from 'vitest';

import type { ListedPackage } from '../../../src/foundry/setup-game';
import {
  compatibilityText,
  fitsCore,
  installable,
  isBehind,
  keptSystems,
  matching,
  pendingPackages,
  tagText,
} from '../../../src/lib/install';
import { buildOverview } from '../../../src/lib/overview';
import { installation, installedModule } from '../../mocks/fixtures';

/**
 * A package on Foundry's listing.
 * @param id - Its ID
 * @param change - What differs
 * @returns The package, a module for any system that runs on Foundry 14
 */
const listed = (id: string, change: Partial<ListedPackage> = {}): ListedPackage => ({
  type: 'module',
  id,
  title: id.toUpperCase(),
  version: '1.0.0',
  compatibility: { minimum: '14' },
  systems: [],
  unowned: false,
  ...change,
});

describe('fitsCore', () => {
  test.each<[ListedPackage['compatibility'], string, boolean]>([
    [{}, '14.368', true],
    [{ minimum: '14' }, '14.368', true],
    [{ minimum: '14.369' }, '14.368', false],
    [{ minimum: '13', maximum: '13' }, '14.368', false],
    [{ minimum: '13', maximum: '14' }, '14.368', true],
    [{ maximum: '14.360' }, '14.368', false],
    [{ maximum: '14.368', verified: '14' }, '14.368', true],
    [{ minimum: 'soon' }, '14.368', true],
    [{ minimum: '15' }, 'odd', true],
  ])('admits %j on %s: %s', (compatibility, core, fits) => {
    expect(fitsCore(compatibility, core)).toBe(fits);
  });
});

describe('isBehind', () => {
  test.each<[ListedPackage['compatibility'], string, boolean]>([
    [{}, '14.368', false],
    [{ minimum: '0.6.6' }, '14.368', true],
    [{ minimum: '11', verified: '12' }, '14.368', true],
    [{ minimum: '11', verified: '13.351' }, '14.368', false],
    [{ minimum: '13' }, '14.368', false],
    [{ minimum: '12', maximum: '14' }, '14.368', false],
    [{ minimum: 'soon' }, '14.368', false],
    [{ minimum: '0.6.6' }, 'odd', false],
  ])('judges %j on %s behind: %s', (compatibility, core, behind) => {
    expect(isBehind(compatibility, core)).toBe(behind);
  });
});

describe('installable', () => {
  const OVERVIEW = buildOverview(
    installation({
      modules: [installedModule('have', 'Have', '1.0.0')],
      systems: [
        { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
        { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
      ],
    }),
    new Map(),
  );

  test('offers what is not installed, may be installed, runs on the build, and is for a system kept', () => {
    const offered = installable(
      [
        listed('any'),
        listed('have'),
        listed('premium', { unowned: true }),
        listed('old', { compatibility: { maximum: '13' } }),
        listed('dnd', { systems: ['dnd5e'] }),
        listed('pf', { systems: ['pf2e'] }),
        listed('sw', { systems: ['sw5e'] }),
        listed('dnd5e', { type: 'system' }),
        listed('sw5e', { type: 'system' }),
      ],
      OVERVIEW,
      { core: '14.368', systems: ['dnd5e'] },
    );

    expect(offered.map(({ type, id }) => `${type}:${id}`)).toEqual(['module:any', 'module:dnd', 'system:sw5e']);
  });

  test('hides what is made for a generation more than one behind, and premium packages not owned, unless asked', () => {
    const listing = [
      listed('any'),
      listed('ancient', { compatibility: { minimum: '0.6.6' } }),
      listed('premium', { unowned: true }),
    ];
    const target = { core: '14.368', systems: [] };
    const ids = (filters: Parameters<typeof installable>[3]) =>
      installable(listing, OVERVIEW, target, filters).map(({ id }) => id);

    expect(ids({ hideBehind: true, showUnowned: false })).toEqual(['any']);
    expect(ids({ hideBehind: false, showUnowned: false })).toEqual(['any', 'ancient']);
    expect(ids({ hideBehind: true, showUnowned: true })).toEqual(['any', 'premium']);
  });
});

describe('keptSystems', () => {
  test('keeps the game systems installed that the plan does not uninstall, and adds those it installs', () => {
    const overview = buildOverview(
      installation({
        systems: [
          { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
          { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
        ],
      }),
      new Map(),
    );

    expect(
      keptSystems(overview, [
        ['system:dnd5e', '5.4.0'],
        ['system:pf2e', 'uninstall'],
        ['system:sw5e', '2.0.0'],
        ['system:gone', 'uninstall'],
        ['module:tools', '1.0.0'],
      ]),
    ).toEqual(['dnd5e', 'sw5e']);
  });
});

describe('pendingPackages', () => {
  test("takes the plan's changes to packages not installed, with the game systems a module is for", () => {
    expect(
      pendingPackages(
        [
          { key: 'core', chosen: '14.369' },
          { key: 'system:pf2e', chosen: '7.0.0' },
          { key: 'module:maps', chosen: '1.1.0' },
          { key: 'module:unlisted', chosen: '2.0.0' },
          { key: 'module:lib', installed: '1.0.0', chosen: '2.0.0' },
          { key: 'module:old', installed: '1.0.0', chosen: 'uninstall' },
        ],
        key => key.toUpperCase(),
        [listed('maps', { systems: ['pf2e'] })],
      ),
    ).toEqual([
      { key: 'system:pf2e', title: 'SYSTEM:PF2E', version: '7.0.0', systems: [] },
      { key: 'module:maps', title: 'MODULE:MAPS', version: '1.1.0', systems: ['pf2e'] },
      { key: 'module:unlisted', title: 'MODULE:UNLISTED', version: '2.0.0', systems: [] },
    ]);
  });
});

describe('matching', () => {
  test('finds the packages whose title, ID or author has the text, ignoring case', () => {
    const packages = [listed('midi', { title: 'Midi QOL', author: 'tposney' }), listed('dice', { title: 'Dice' })];

    expect(matching(packages, '  ')).toBe(packages);
    expect(matching(packages, 'qol').map(({ id }) => id)).toEqual(['midi']);
    expect(matching(packages, 'TPOS').map(({ id }) => id)).toEqual(['midi']);
    expect(matching(packages, 'dice').map(({ id }) => id)).toEqual(['dice']);
  });
});

describe('in words', () => {
  test('says which builds a package declares, and its tags', () => {
    expect(compatibilityText({ minimum: '13', verified: '14.368' })).toBe('minimum 13, verified 14.368');
    expect(compatibilityText({ maximum: '14' })).toBe('maximum 14');
    expect(compatibilityText({})).toBe('Declares no builds');
    expect(['audio-sound', 'maps'].map(tagText)).toEqual(['Audio Sound', 'Maps']);
  });
});
