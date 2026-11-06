import { describe, expect, test, vi } from 'vitest';

import type { PlanEntry } from '../../../src/lib/plans';
import { UNINSTALL } from '../../../src/lib/plans';
import type { RunStep } from '../../../src/lib/run';
import { INSTALLS_AT_ONCE, runScheduled, runSteps, stepText } from '../../../src/lib/run';
import type { Safeguard } from '../../../src/lib/safeguards';

const SNAPSHOT: Safeguard = { key: 'snapshot', kind: 'snapshot', checked: true, recommended: true, note: 'Before' };
const ALPHA: Safeguard = {
  key: 'world:alpha',
  kind: 'backup',
  world: { id: 'alpha', title: 'Alpha' },
  packages: ['Midi'],
  checked: true,
  recommended: false,
  note: 'Before Midi',
};
const PLAN: readonly PlanEntry[] = [
  { key: 'core', installed: '14.368', version: '14.369' },
  {
    key: 'system:dnd5e',
    installed: '5.3.3',
    version: '6.0.6',
    manifest: 'https://example.org/dnd5e/6.0.6/system.json',
  },
  { key: 'module:midi', installed: '1.0.0', version: '2.0.0' },
  { key: 'module:old', installed: '1.0.0', version: UNINSTALL },
];
const TITLES: Readonly<Record<string, string>> = {
  'system:dnd5e': 'D&D 5e',
  'module:midi': 'Midi',
  'module:old': 'Old',
};

describe('runSteps', () => {
  test('makes the snapshot and backups checked, then each change, in order', () => {
    expect(runSteps([SNAPSHOT, { ...ALPHA, checked: false }], PLAN, key => TITLES[key] ?? key)).toEqual([
      { kind: 'snapshot', key: 'snapshot', note: 'Before' },
      { kind: 'core', key: 'core', version: '14.369' },
      {
        kind: 'install',
        key: 'system:dnd5e',
        type: 'system',
        id: 'dnd5e',
        title: 'D&D 5e',
        version: '6.0.6',
        manifest: 'https://example.org/dnd5e/6.0.6/system.json',
      },
      // Without a manifest URL, the step is still taken, and fails saying so.
      { kind: 'install', key: 'module:midi', type: 'module', id: 'midi', title: 'Midi', version: '2.0.0' },
      { kind: 'uninstall', key: 'module:old', type: 'module', id: 'old', title: 'Old' },
    ]);
    expect(runSteps([{ ...SNAPSHOT, checked: false }, ALPHA], [], key => key)).toEqual([
      { kind: 'backup', key: 'world:alpha', world: { id: 'alpha', title: 'Alpha' }, note: 'Before Midi' },
    ]);
  });
});

describe('stepText', () => {
  test.each<[RunStep, string]>([
    [{ kind: 'snapshot', key: 'snapshot', note: '' }, 'make a snapshot of the installation'],
    [{ kind: 'backup', key: 'world:a', world: { id: 'a', title: 'Alpha' }, note: '' }, 'back up Alpha'],
    [
      { kind: 'install', key: 'module:midi', type: 'module', id: 'midi', title: 'Midi', version: '2.0.0' },
      'install Midi 2.0.0',
    ],
    [{ kind: 'uninstall', key: 'system:old', type: 'system', id: 'old', title: 'Old' }, 'uninstall Old'],
    [
      { kind: 'core', key: 'core', version: '14.369' },
      'stop before updating Foundry VTT to 14.369: the steps after it wait for another run',
    ],
  ])('words %j', (step, words) => {
    expect(stepText(step)).toBe(words);
  });
});

describe('runScheduled', () => {
  type Step = Exclude<RunStep, { kind: 'core' }>;

  /**
   * An install of a module.
   * @param id - The module
   * @param more - What else it has, such as what it waits for
   * @returns The step
   */
  const install = (id: string, more: Partial<Extract<Step, { kind: 'install' }>> = {}): Step => ({
    kind: 'install',
    key: `module:${id}`,
    type: 'module',
    id,
    title: id,
    version: '1.0.0',
    manifest: `https://example.org/${id}.json`,
    ...more,
  });

  /**
   * An uninstall of a module.
   * @param id - The module
   * @param after - What it waits for
   * @returns The step
   */
  const uninstall = (id: string, after?: string[]): Step => ({
    kind: 'uninstall',
    key: `module:${id}`,
    type: 'module',
    id,
    title: id,
    ...(after !== undefined && { after }),
  });

  const snapshot: Step = { kind: 'snapshot', key: 'snapshot', note: '' };

  /**
   * Run steps, each held until let go, recording what happens.
   * @param steps - The steps
   * @param failing - The keys of the steps that fail
   * @returns What happened, and how to let the running steps go
   */
  function scheduled(steps: readonly Step[], failing: readonly string[] = []) {
    const events: string[] = [];
    const running = new Map<string, () => void>();
    let most = 0;
    const done = runScheduled(steps, {
      run: step =>
        new Promise<void>((resolve, reject) => {
          running.set(step.key, () => {
            running.delete(step.key);
            if (failing.includes(step.key)) reject(new Error(`${step.key} broke`));
            else resolve();
          });
          most = Math.max(most, running.size);
        }),
      onStart: step => events.push(`start ${step.key}`),
      onDone: step => events.push(`done ${step.key}`),
      onFail: step => events.push(`fail ${step.key}`),
      onSkip: (step, needed) => events.push(`skip ${step.key} for ${needed.map(({ key }) => key).join(' ')}`),
    });
    /** Let every step running now go, and wait for what that starts. */
    const settle = async (): Promise<void> => {
      for (const finish of [...running.values()]) finish();
      await vi.waitFor(() => {
        expect(events.length).toBeGreaterThan(0);
      });
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    };
    /** Let steps go until the run is over. */
    const finishAll = async (): Promise<void> => {
      const run = { over: false };
      void done.then(() => (run.over = true));
      while (!run.over) await settle();
    };
    return { events, running, most: () => most, settle, finishAll, done };
  }

  test(`runs up to ${String(INSTALLS_AT_ONCE)} installs at once, starting the next as one is done`, async () => {
    const steps = Array.from({ length: INSTALLS_AT_ONCE + 2 }, (_, index) => install(`m${String(index)}`));
    const run = scheduled(steps);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(run.running.size).toBe(INSTALLS_AT_ONCE);

    await run.finishAll();

    expect(run.most()).toBe(INSTALLS_AT_ONCE);
    expect(run.events.filter(event => event.startsWith('done'))).toHaveLength(steps.length);
  });

  test('starts a step only once the steps it waits for are done, which need not be in the run', async () => {
    const run = scheduled([install('app', { after: ['module:lib', 'module:elsewhere'] }), install('lib')]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect([...run.running.keys()]).toEqual(['module:lib']);

    await run.finishAll();

    expect(run.events).toEqual(['start module:lib', 'done module:lib', 'start module:app', 'done module:app']);
  });

  test('does not run what needs a step that failed, nor what needs that, and goes on with the rest', async () => {
    const run = scheduled(
      [
        install('lib'),
        install('app', { after: ['module:lib'] }),
        install('addon', { after: ['module:app'] }),
        install('other'),
        uninstall('old', ['module:app']),
      ],
      ['module:lib'],
    );

    await run.finishAll();

    expect(run.events).toEqual([
      'start module:lib',
      'start module:other',
      'fail module:lib',
      'done module:other',
      'skip module:app for module:lib',
      'skip module:addon for module:app',
      // What it waits for was not run, so it might still need the old module.
      'skip module:old for module:app',
    ]);
  });

  test('makes the snapshot first, alone, and changes nothing if it fails', async () => {
    const run = scheduled([snapshot, install('lib'), uninstall('old')], ['snapshot']);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect([...run.running.keys()]).toEqual(['snapshot']);

    await run.finishAll();

    expect(run.events).toEqual([
      'start snapshot',
      'fail snapshot',
      'skip module:lib for snapshot',
      'skip module:old for snapshot',
    ]);
  });

  test('installs what was added against advice once every other install is over, whatever became of it', async () => {
    const run = scheduled(
      [install('lib'), install('forced', { forced: true }), uninstall('a'), uninstall('b')],
      ['module:lib'],
    );

    await run.finishAll();

    expect(run.events).toEqual([
      'start module:lib',
      'fail module:lib',
      'start module:forced',
      'done module:forced',
      // One at a time.
      'start module:a',
      'done module:a',
      'start module:b',
      'done module:b',
    ]);
  });

  test('does not run a step that waits for one that only comes later', async () => {
    const run = scheduled([install('app', { after: ['module:old'] }), uninstall('old')]);

    await run.finishAll();

    expect(run.events).toEqual(['skip module:app for module:old', 'start module:old', 'done module:old']);
  });
});
