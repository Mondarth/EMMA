import { describe, expect, test } from 'vitest';

import type { ListedPackage } from '../../../src/foundry/setup-game';
import { fitsCore, installable, matching } from '../../../src/lib/install';
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
