import { beforeEach, describe, expect, test, vi } from 'vitest';

import { log } from '@module/lib/logger';
import { installFoundryMocks } from '../../mocks/foundry';

describe('log', () => {
  beforeEach(() => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
  });

  test.each(['info', 'warn', 'error'] as const)('%s prefixes messages with the module ID', level => {
    installFoundryMocks();
    const detail = { some: 'value' };

    log[level]('message', detail);

    expect(console[level]).toHaveBeenCalledExactlyOnceWith('mondarth-emma |', 'message', detail);
  });

  test('debug is silent while hook debugging is off', () => {
    installFoundryMocks({ debugHooks: false });

    log.debug('message');

    expect(console.debug).not.toHaveBeenCalled();
  });

  test('debug writes while hook debugging is on', () => {
    installFoundryMocks({ debugHooks: true });

    log.debug('message');

    expect(console.debug).toHaveBeenCalledExactlyOnceWith('mondarth-emma |', 'message');
  });
});
