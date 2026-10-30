import type { WorldRecord } from '@mondarth/emma-core/world-record';

import type { RecordState } from '../../src/foundry/records';
import type { InstalledModule, Installation } from '../../src/foundry/setup-game';

/**
 * A world record.
 * @param world - The world's ID
 * @param change - What differs from the default: Foundry 14.368, D&D 5e 5.3.3 and no modules
 * @returns The record
 */
export function record(world: string, change: Partial<WorldRecord> = {}): WorldRecord {
  return {
    schema: 1,
    emma: '0.9.0',
    world: { id: world, title: world },
    core: '14.368',
    system: { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
    modules: [],
    updated: '2026-10-28T12:00:00.000Z',
    ...change,
  };
}

/**
 * A recorded state.
 * @param value - The record
 * @returns The state of a world with that record
 */
export function recorded(value: WorldRecord): RecordState {
  return { kind: 'recorded', record: value };
}

/**
 * An installation: Foundry 14.368, D&D 5e 5.3.3, and what the test adds.
 * @param change - What differs
 * @returns The installation
 */
export function installation(change: Partial<Installation> = {}): Installation {
  return {
    core: '14.368',
    worlds: [],
    modules: [],
    systems: [{ id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' }],
    ...change,
  };
}

/**
 * An installed module.
 * @param id - Its ID
 * @param title - Its title
 * @param version - Its version
 * @param related - The game systems it is for and the modules it requires, if any
 * @returns The module
 */
export function installedModule(
  id: string,
  title: string,
  version: string,
  related: Partial<Pick<InstalledModule, 'systems' | 'requires'>> = {},
): InstalledModule {
  return { id, title, version, systems: [], requires: [], ...related };
}
