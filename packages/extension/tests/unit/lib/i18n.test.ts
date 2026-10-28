import { describe, expect, test } from 'vitest';

import { t } from '../../../src/lib/i18n';
import { installChromeMock } from '../../mocks/chrome';

describe('t', () => {
  test('translates a message, filling in its placeholders', () => {
    installChromeMock();

    expect(t('server', 'http://localhost:30000')).toBe('Server: http://localhost:30000');
  });

  test('gives the key back for a message it has not', () => {
    installChromeMock();

    expect(t('missing')).toBe('missing');
  });
});
