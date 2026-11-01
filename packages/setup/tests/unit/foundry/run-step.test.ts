import { describe, expect, test, vi } from 'vitest';

import type { Guard } from '../../../src/foundry/guard';
import { runStep } from '../../../src/foundry/run-step';
import type { SetupGame } from '../../../src/foundry/setup-game';

/**
 * The setup screen's `game`, with what a run calls.
 * @param change - What differs
 * @returns The game
 */
function gameWith(change: Partial<SetupGame> = {}): SetupGame {
  return {
    view: 'setup',
    version: '14.368',
    worlds: [],
    modules: [],
    systems: [],
    post: vi.fn(),
    createSnapshot: vi.fn(() => Promise.resolve()),
    createBackup: vi.fn(() => Promise.resolve(true)),
    installPackage: vi.fn(() => Promise.resolve({})),
    ...change,
  };
}

/**
 * A guard that records when it lets requests through.
 * @param events - Where it records
 * @returns The guard
 */
function guardRecording(events: string[]): Guard {
  return {
    refresh: vi.fn(),
    remove: vi.fn(),
    allowing: async run => {
      events.push('allowing');
      try {
        return await run();
      } finally {
        events.push('guarding');
      }
    },
  };
}

const INSTALL = {
  kind: 'install',
  key: 'module:midi',
  type: 'module',
  id: 'midi',
  title: 'Midi',
  version: '2.0.0',
  manifest: 'https://example.org/midi/2.0.0/module.json',
} as const;

describe('runStep', () => {
  test("makes a snapshot with its note, as Foundry's Manage Backups does", async () => {
    const game = gameWith();
    await runStep(game, guardRecording([]), { kind: 'snapshot', key: 'snapshot', note: 'Before' });
    expect(game.createSnapshot).toHaveBeenCalledWith({ note: 'Before' });
  });

  test('backs a world up with its note, failing if Foundry could not', async () => {
    const game = gameWith();
    const step = { kind: 'backup', key: 'world:a', world: { id: 'a', title: 'Alpha' }, note: 'Before' } as const;

    await runStep(game, guardRecording([]), step);
    expect(game.createBackup).toHaveBeenCalledWith({ type: 'world', id: 'a', title: 'Alpha' }, { note: 'Before' });

    vi.mocked(game.createBackup)?.mockResolvedValueOnce(false);
    await expect(runStep(game, guardRecording([]), step)).rejects.toThrow('Foundry could not back up Alpha.');
  });

  test("installs a package from its version's manifest, through the guard, without Foundry's dependency dialog", async () => {
    const events: string[] = [];
    const game = gameWith({
      installPackage: vi.fn(() => {
        events.push('install');
        return Promise.resolve({});
      }),
    });

    await runStep(game, guardRecording(events), INSTALL);

    expect(events).toEqual(['allowing', 'install', 'guarding']);
    expect(game.installPackage).toHaveBeenCalledWith({
      type: 'module',
      id: 'midi',
      manifest: 'https://example.org/midi/2.0.0/module.json',
      dependencies: false,
      notify: false,
    });
  });

  test('fails a package with no manifest of its own, installing nothing', async () => {
    const game = gameWith();
    const bare = {
      kind: 'install',
      key: 'module:midi',
      type: 'module',
      id: 'midi',
      title: 'Midi',
      version: '2.0.0',
    } as const;

    await expect(runStep(game, guardRecording([]), bare)).rejects.toThrow(
      'EMMA has no manifest URL for Midi 2.0.0 alone, so cannot install it.',
    );
    expect(game.installPackage).not.toHaveBeenCalled();
  });

  test.each([
    ['createSnapshot', { kind: 'snapshot', key: 'snapshot', note: '' }, 'no way to make a snapshot'],
    ['createBackup', { kind: 'backup', key: 'world:a', world: { id: 'a', title: 'A' }, note: '' }, 'no way to back'],
    ['installPackage', INSTALL, 'no way to install'],
  ] as const)('fails when Foundry offers no %s', async (method, step, message) => {
    const game = gameWith({ [method]: undefined });
    await expect(runStep(game, guardRecording([]), step)).rejects.toThrow(message);
  });
});
