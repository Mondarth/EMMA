import { describe, expect, test, vi } from 'vitest';

import type { Guard } from '../../../src/foundry/guard';
import { installEmma } from '../../../src/foundry/install-emma';
import type { SetupGame } from '../../../src/foundry/setup-game';
import { EMMA_MANIFEST } from '../../../src/foundry/setup-kit';

/**
 * A guard that records when it lets requests through.
 * @param events - Where to record
 * @returns The guard
 */
function recordingGuard(events: string[]): Guard {
  return {
    refresh: vi.fn(),
    remove: vi.fn(),
    async allowing(run) {
      events.push('allow');
      try {
        return await run();
      } finally {
        events.push('guard');
      }
    },
  };
}

describe('installEmma', () => {
  test('installs the module, then has Foundry ask about its dependencies, both let through by the guard', async () => {
    const events: string[] = [];
    const pkg = { id: 'mondarth-emma' };
    const game = {
      installPackage: vi.fn(() => {
        events.push('install');
        return Promise.resolve(pkg);
      }),
      installDependencies: vi.fn(() => {
        events.push('dependencies');
        return Promise.resolve(true);
      }),
    };

    await installEmma(game as unknown as SetupGame, recordingGuard(events));

    expect(game.installPackage).toHaveBeenCalledExactlyOnceWith({
      type: 'module',
      id: 'mondarth-emma',
      manifest: EMMA_MANIFEST,
      dependencies: false,
    });
    expect(game.installDependencies).toHaveBeenCalledExactlyOnceWith(pkg);
    expect(events).toEqual(['allow', 'install', 'dependencies', 'guard']);
  });

  test('installs the module alone where Foundry cannot ask about dependencies', async () => {
    const game = { installPackage: vi.fn(() => Promise.resolve({})) };

    await installEmma(game as unknown as SetupGame, recordingGuard([]));

    expect(game.installPackage).toHaveBeenCalledOnce();
  });

  test('fails where Foundry cannot install packages, or the install fails', async () => {
    await expect(installEmma({} as SetupGame, recordingGuard([]))).rejects.toThrow(/install packages/);
    const failing = { installPackage: () => Promise.reject(new Error('offline')) };
    await expect(installEmma(failing as unknown as SetupGame, recordingGuard([]))).rejects.toThrow('offline');
  });
});
