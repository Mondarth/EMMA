import { beforeEach, describe, expect, test } from 'vitest';

import type { SetupCheck } from '@module/adapters/report';
import { checkText, planTables, planText, updateText } from '@module/lib/report-text';
import { installFoundryMocks } from '../../mocks/foundry';

const SETUP = { core: '14.368', system: 'dnd5e 6.0.0', modules: 2 };
const SUMMARY = 'MONDARTH-EMMA.Report.Setup {"core":"14.368","system":"dnd5e 6.0.0","count":"2"}';

describe('report text', () => {
  beforeEach(() => {
    // Short column names, to see the columns line up.
    const { game } = installFoundryMocks();
    game.i18n.localize.mockImplementation((key: string) => key.slice(key.lastIndexOf('.') + 1));
  });

  test('plans in two numbered lists of columns, the changes first, padded alike to the widest entry of either', () => {
    const plan = Array.from({ length: 11 }, (_, index) => ({
      id: `m${String(index)}`,
      title: index === 0 ? 'A long title' : 'T',
      changes: index < 10,
      manifest: index === 1 ? null : `https://x.test/${String(index)}`,
    }));

    const { changes, kept } = planTables(plan);

    expect(changes?.slice(0, 3)).toEqual([
      '     Id   Name          Manifest',
      ' 1.  m0   A long title  https://x.test/0',
      ' 2.  m1   T             NoManifest',
    ]);
    expect(changes?.at(-1)).toBe('10.  m9   T             https://x.test/9');
    expect(kept).toEqual(['     Id   Name          Manifest', ' 1.  m10  T             https://x.test/10']);
  });

  test('has no list where there is nothing in it', () => {
    expect(planTables([{ id: 'a', title: 'A', changes: false, manifest: null }]).changes).toBeNull();
    expect(planTables([{ id: 'a', title: 'A', changes: true, manifest: null }]).kept).toBeNull();
  });

  test('heads the plan and each list, says when a list is empty, and when no module is active', () => {
    expect(planText(SETUP, [{ id: 'a', title: 'A', changes: true, manifest: null }]).split('\n')).toEqual([
      'Heading',
      SUMMARY,
      '',
      'Changes',
      '    Id  Name  Manifest',
      '1.  a   A     NoManifest',
      '',
      'Kept',
      'NoneKept',
    ]);
    expect(
      planText(SETUP, [{ id: 'a', title: 'A', changes: false, manifest: null }])
        .split('\n')
        .slice(3, 5),
    ).toEqual(['Changes', 'NoChanges']);
    expect(planText(SETUP, []).split('\n').at(-1)).toBe('Empty');
  });

  test('checks every module with something to report, then lists those with nothing to report together', () => {
    const check: SetupCheck = {
      setup: SETUP,
      valid: false,
      modules: [
        { id: 'a', title: 'A', version: '1.0', badge: null, notes: [] },
        {
          id: 'b',
          title: 'B',
          version: '2.0',
          badge: { type: 'warning', icon: 'i', tooltip: 't', text: 'Unverified' },
          notes: ['One.', 'Two.'],
        },
      ],
    };

    expect(checkText(check).split('\n')).toEqual([
      'Heading',
      SUMMARY,
      '',
      'Invalid',
      '',
      'MONDARTH-EMMA.Report.Check.Module {"title":"B","version":"2.0","verdict":"Unverified"}',
      '  - One.',
      '  - Two.',
      // Two blank lines set the modules with nothing to report apart.
      '',
      '',
      'Nothing',
      '- MONDARTH-EMMA.Report.Check.ModuleUnjudged {"title":"A","version":"1.0"}',
    ]);
    expect(checkText({ ...check, valid: true, modules: [] }).split('\n')[3]).toBe('Valid');
  });

  test('lists every module right after the verdict when none has anything to report', () => {
    const check: SetupCheck = {
      setup: SETUP,
      valid: true,
      modules: [{ id: 'a', title: 'A', version: '1.0', badge: null, notes: [] }],
    };

    expect(checkText(check).split('\n').slice(4)).toEqual([
      '',
      'Nothing',
      '- MONDARTH-EMMA.Report.Check.ModuleUnjudged {"title":"A","version":"1.0"}',
    ]);
  });

  test('resolves to changes, to nothing to change, to why not, or to what it needs', () => {
    const changes = updateText(SETUP, {
      solution: {
        kind: 'found',
        changes: [
          { package: { type: 'module', id: 'lib' }, title: 'Lib', from: '1.0', to: '2.0' },
          { package: { type: 'module', id: 'helper' }, title: 'Helper', from: null, to: '1.0' },
        ],
      },
      unloaded: ['dae 1.0'],
    });
    const nothing = updateText(SETUP, { solution: { kind: 'found', changes: [] }, unloaded: [] });
    const none = updateText(SETUP, { solution: { kind: 'none', lines: ['First.', 'Second. (1)'] }, unloaded: [] });
    const undecided = updateText(SETUP, { solution: { kind: 'undecided', needs: ['a 1.0'] }, unloaded: [] });

    expect(changes.split('\n')).toEqual([
      'Heading',
      SUMMARY,
      '',
      'Found Changes',
      '  - MONDARTH-EMMA.Report.Solve.Change {"package":"Lib","from":"1.0","to":"2.0"}',
      '  - MONDARTH-EMMA.Report.Solve.Add {"package":"Helper","version":"1.0"}',
      '',
      'MONDARTH-EMMA.Report.Solve.Unloaded {"packages":"dae 1.0"}',
    ]);
    expect(nothing.split('\n').slice(3)).toEqual(['Found NoChanges']);
    expect(none.split('\n').slice(3)).toEqual(['None', '  First.', '  Second. (1)']);
    expect(undecided.split('\n').slice(3)).toEqual(['MONDARTH-EMMA.Report.Solve.Undecided {"packages":"a 1.0"}']);
  });
});
