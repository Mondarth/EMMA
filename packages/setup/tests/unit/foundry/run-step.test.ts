import { describe, expect, test, vi } from 'vitest';

import type { Guard } from '../../../src/foundry/guard';
import { progressOf, runStep } from '../../../src/foundry/run-step';
import type { PackageInstall, SetupGame } from '../../../src/foundry/setup-game';

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
  test("uninstalls a package as Foundry's Uninstall does once confirmed: the server deletes it, then the screen forgets it", async () => {
    const events: string[] = [];
    const uninstall = vi.fn((id: string) => {
      events.push(`forget ${id}`);
    });
    vi.stubGlobal('foundry', { packages: { PACKAGE_TYPES: { module: { uninstall } } } });
    const game = gameWith({
      post: vi.fn((request: object) => {
        events.push(`post ${JSON.stringify(request)}`);
        return Promise.resolve({});
      }),
      reload: vi.fn(() => {
        events.push('reload');
        return Promise.resolve();
      }),
    });

    await runStep(game, guardRecording(events), {
      kind: 'uninstall',
      key: 'module:old',
      type: 'module',
      id: 'old',
      title: 'Old',
    });

    // Through the guard, as the guard refuses Foundry's own uninstalls.
    expect(events).toEqual([
      'allowing',
      'post {"action":"uninstallPackage","type":"module","id":"old"}',
      'forget old',
      'reload',
      'guarding',
    ]);
    expect(game.post).toHaveBeenCalledWith(expect.anything(), { notify: false });
    vi.unstubAllGlobals();
  });

  test('fails if the server refuses to uninstall, and uninstalls without the rest where Foundry lacks it', async () => {
    const step = { kind: 'uninstall', key: 'system:old', type: 'system', id: 'old', title: 'Old' } as const;
    const refusing = gameWith({ post: vi.fn(() => Promise.reject(new Error('In use'))) });
    await expect(runStep(refusing, guardRecording([]), step)).rejects.toThrow('In use');

    vi.stubGlobal('foundry', { packages: { PACKAGE_TYPES: { system: 'odd' } } });
    const game = gameWith({ post: vi.fn(() => Promise.resolve({})) });
    await runStep(game, guardRecording([]), step);
    expect(game.post).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

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
      onProgress: expect.any(Function) as unknown,
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

describe('progressOf', () => {
  test.each([
    ['downloading', { step: 'download', pct: 41.6 }, { phase: 'download', pct: 42 }],
    ['installing, extracting its files', { step: 'install', pct: 70 }, { phase: 'install', pct: 70 }],
    ['past the end', { step: 'install', pct: 120 }, { phase: 'install', pct: 100 }],
    ['before the start', { step: 'download', pct: -3 }, { phase: 'download', pct: 0 }],
    ['done', { step: 'complete', pct: 100 }, undefined],
    ['with no percentage', { step: 'download' }, undefined],
    ['with a percentage that is not a number', { step: 'download', pct: Number.NaN }, undefined],
    ['nothing', undefined, undefined],
  ])('reads how far an install has got from a packet %s', (_, data, progress) => {
    expect(progressOf(data)).toEqual(progress);
  });
});

describe('runStep, telling how far an install has got', () => {
  test("passes on Foundry's progress, each time it changes", async () => {
    const told: unknown[] = [];
    const game = gameWith({
      installPackage: vi.fn(({ onProgress }: PackageInstall) => {
        for (const data of [
          { step: 'download', pct: 10 },
          { step: 'download', pct: 10.2 },
          { step: 'download', pct: 100 },
          { step: 'install', pct: 50 },
          { step: 'complete', pct: 100 },
        ]) {
          onProgress?.(Object.assign(new Event('progress'), { data }));
        }
        return Promise.resolve({});
      }),
    });

    await runStep(game, guardRecording([]), INSTALL, progress => told.push(progress));

    expect(told).toEqual([
      { phase: 'download', pct: 10 },
      { phase: 'download', pct: 100 },
      { phase: 'install', pct: 50 },
    ]);
  });

  test('installs as before when no one asks how far', async () => {
    const game = gameWith({
      installPackage: vi.fn(({ onProgress }: PackageInstall) => {
        onProgress?.(Object.assign(new Event('progress'), { data: { step: 'download', pct: 10 } }));
        return Promise.resolve({});
      }),
    });

    await expect(runStep(game, guardRecording([]), INSTALL)).resolves.toBeUndefined();
  });
});
