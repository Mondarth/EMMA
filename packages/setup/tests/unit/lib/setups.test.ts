import { describe, expect, test } from 'vitest';

import { buildOverview } from '../../../src/lib/overview';
import { inUse } from '../../../src/lib/setups';
import { installation, installedModule, record, recorded } from '../../mocks/fixtures';

describe('inUse', () => {
  test("is each world's game system, recorded or not, and the modules recorded worlds run or will need", () => {
    const overview = buildOverview(
      installation({
        worlds: [
          { id: 'a', title: 'Alpha', system: 'dnd5e' },
          { id: 'b', title: 'Beta', system: 'pf2e' },
          { id: 'c', title: 'Gamma', system: 'swade' },
        ],
        systems: [
          { id: 'dnd5e', title: 'D&D 5e', version: '5.3.3' },
          { id: 'pf2e', title: 'Pathfinder', version: '7.0.0' },
          { id: 'idle', title: 'Idle system', version: '1.0.0' },
        ],
        modules: [
          installedModule('app', 'App', '1.0.0', { requires: ['lib'] }),
          installedModule('lib', 'Library', '1.0.0'),
          installedModule('spare', 'Spare', '1.0.0'),
        ],
      }),
      // Alpha runs App, which needs Library; Beta has no record; Gamma's system is not installed.
      new Map([['a', recorded(record('a', { modules: [{ id: 'app', title: 'App', version: '1.0.0' }] }))]]),
    );

    expect([...inUse(overview)].sort()).toEqual(['module:app', 'module:lib', 'system:dnd5e', 'system:pf2e']);
  });
});
