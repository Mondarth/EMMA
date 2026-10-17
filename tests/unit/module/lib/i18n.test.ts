import { describe, expect, test } from 'vitest';

import { localize } from '@module/lib/i18n';
import { installFoundryMocks } from '../../mocks/foundry';

describe('localize', () => {
  test('translates through game.i18n', () => {
    const { game } = installFoundryMocks();
    game.i18n.localize.mockReturnValueOnce('Translated');

    expect(localize('MONDARTH-EMMA.Key')).toBe('Translated');
    expect(game.i18n.localize).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Key');
  });
});
