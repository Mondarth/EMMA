import { beforeEach, describe, expect, test } from 'vitest';

import { lockedTooltip } from '@module/lib/locked';
import { ModuleState } from '@module/state/module-state.svelte';
import { moduleEntry } from '../../mocks/entries';
import { installFoundryMocks } from '../../mocks/foundry';

const LIB = moduleEntry({ id: 'lib', title: 'Library' });
const ENTRIES = [
  moduleEntry({ id: 'app', title: 'App', requires: ['lib'] }),
  LIB,
  moduleEntry({ id: 'tool', title: 'Tool', requires: ['lib'] }),
];

describe('lockedTooltip', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('says nothing for a module that is not locked', () => {
    expect(lockedTooltip(new ModuleState(ENTRIES, { lib: true }), LIB)).toBeUndefined();
  });

  // Regression test for #25: with one module requiring it, the explanation was worded for several.
  test('uses the singular wording when one active module requires it', () => {
    expect(lockedTooltip(new ModuleState(ENTRIES, { app: true, lib: true }), LIB)).toBe(
      'MONDARTH-EMMA.Requirements.LockedOne {"module":"Library","parent":"App"}',
    );
  });

  test('uses the plural wording, naming them all, when several do', () => {
    expect(lockedTooltip(new ModuleState(ENTRIES, { app: true, lib: true, tool: true }), LIB)).toBe(
      'MONDARTH-EMMA.Requirements.LockedMany {"module":"Library","parents":"App and Tool"}',
    );
  });

  test('says a module judged incompatible cannot be activated, or one requiring it', () => {
    const state = new ModuleState(ENTRIES, {}, { incompatible: id => id === 'lib' });

    expect(lockedTooltip(state, LIB)).toBe('MONDARTH-EMMA.Requirements.Incompatible {"module":"Library"}');
    expect(lockedTooltip(state, ENTRIES[0] as typeof LIB)).toBe(
      'MONDARTH-EMMA.Requirements.RequiresIncompatible {"module":"App","modules":"Library"}',
    );
  });
});
