import { describe, expect, test } from 'vitest';

import { format, formatList, localize } from '@module/lib/i18n';
import { installFoundryMocks } from '../../mocks/foundry';

describe('localize', () => {
  test('translates through game.i18n', () => {
    const { game } = installFoundryMocks();
    game.i18n.localize.mockReturnValueOnce('Translated');

    expect(localize('MONDARTH-EMMA.Key')).toBe('Translated');
    expect(game.i18n.localize).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Key');
  });
});

describe('format', () => {
  test('translates and fills in placeholders through game.i18n', () => {
    const { game } = installFoundryMocks();
    game.i18n.format.mockReturnValueOnce('Filled');

    expect(format('MONDARTH-EMMA.Key', { count: '3' })).toBe('Filled');
    expect(game.i18n.format).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Key', { count: '3' });
  });
});

describe('formatList', () => {
  test('joins items as a list in the user language', () => {
    installFoundryMocks({ lang: 'en' });

    expect(formatList(['A', 'B', 'C'])).toBe('A, B, and C');
  });

  test('follows the user language', () => {
    installFoundryMocks({ lang: 'de' });

    expect(formatList(['A', 'B'])).toBe('A und B');
  });

  test('leaves a single item as it is', () => {
    installFoundryMocks();

    expect(formatList(['A'])).toBe('A');
  });
});
