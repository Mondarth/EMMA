import { describe, expect, test } from 'vitest';

import { isGM, readPlatform } from '@module/adapters/platform';
import { installFoundryMocks } from '../../mocks/foundry';

describe('readPlatform', () => {
  test('reads the Foundry version and the game system in use', () => {
    installFoundryMocks({
      version: '14.370',
      system: { id: 'pf2e', title: 'Pathfinder Second Edition', version: '7.0.1' },
    });

    expect(readPlatform()).toEqual({
      core: '14.370',
      system: { id: 'pf2e', title: 'Pathfinder Second Edition', version: '7.0.1' },
    });
  });
});

describe('isGM', () => {
  test.each([
    { user: 'a GM', gm: true, expected: true },
    { user: 'a player', gm: false, expected: false },
    { user: 'no user yet', gm: null, expected: false },
  ] as const)('is $expected for $user', ({ gm, expected }) => {
    installFoundryMocks({ isGM: gm });

    expect(isGM()).toBe(expected);
  });
});
