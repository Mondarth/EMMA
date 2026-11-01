import { describe, expect, test } from 'vitest';

import type { PlanEntry } from '../../../src/lib/plans';
import type { RunStep } from '../../../src/lib/run';
import { runSteps, stepText } from '../../../src/lib/run';
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
];
const TITLES: Readonly<Record<string, string>> = { 'system:dnd5e': 'D&D 5e', 'module:midi': 'Midi' };

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
    [
      { kind: 'core', key: 'core', version: '14.369' },
      'stop before updating Foundry VTT to 14.369: the steps after it wait for another run',
    ],
  ])('words %j', (step, words) => {
    expect(stepText(step)).toBe(words);
  });
});
