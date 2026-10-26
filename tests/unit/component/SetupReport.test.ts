import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import SetupReport from '@component/SetupReport.svelte';
import type { PlanEntry, ReportedPackage, SetupCheck, SetupReportData, SetupSolve } from '@module/adapters/report';
import { installFoundryMocks } from '../mocks/foundry';

const STYLE = 'MONDARTH-EMMA.Report.Style';
const DOWNLOAD = 'MONDARTH-EMMA.Report.Download';
const SUMMARY = 'MONDARTH-EMMA.Report.Setup {"core":"14.368","system":"dnd5e 6.0.0","count":"2"}';

const PLAN: PlanEntry[] = [
  { id: 'lib-wrapper', title: 'libWrapper', changes: false, manifest: 'https://example.test/lib.json' },
  { id: 'midi-qol', title: 'Midi QOL', changes: true, manifest: null },
];

const CHECK: SetupCheck = {
  setup: { core: '14.368', system: 'dnd5e 6.0.0', modules: 2 },
  valid: false,
  modules: [
    { id: 'lib-wrapper', title: 'libWrapper', version: '1.13.2', badge: null, notes: [] },
    {
      id: 'midi-qol',
      title: 'Midi QOL',
      version: '13.0.2',
      badge: { type: 'warning', icon: 'fa-solid fa-triangle-exclamation', tooltip: 'Unverified', text: 'Unverified' },
      notes: ['Midi QOL 13.0.2 is not verified with dnd5e 6.0.0.'],
    },
  ],
};

/**
 * Render the report.
 * @param options - What to report, by default the plan and check above and a solve that never ends
 * @param options.solve - The solve
 * @param options.check - The check
 * @param options.plan - The plan
 * @param options.ignored - The titles of the modules hypothetical mode ignores; none by default
 * @returns The download handler; its `apply` is the function choosing the versions recommended
 */
function renderReport({
  solve = new Promise<SetupSolve>(() => undefined),
  check = CHECK,
  plan = PLAN,
  ignored = [],
}: { solve?: Promise<SetupSolve>; check?: SetupCheck; plan?: PlanEntry[]; ignored?: readonly string[] } = {}) {
  const onDownload = vi.fn();
  const apply = vi.fn();
  render(SetupReport, { ignored, plan, check, solve, onDownload, apply });
  return Object.assign(onDownload, { apply });
}

/**
 * Show a report style.
 * @param style - The style
 */
async function show(style: 'plan' | 'check' | 'update'): Promise<void> {
  await userEvent.selectOptions(screen.getByLabelText(STYLE), style);
}

/**
 * A region of the report.
 * @param heading - The key of its heading
 * @returns The region
 */
function region(heading: string): HTMLElement {
  return screen.getByRole('region', { name: `MONDARTH-EMMA.Report.${heading}.Heading` });
}

describe('SetupReport', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('offers the plan, the check and the resolve, showing the plan first, with a download beside them', () => {
    renderReport();

    const style = screen.getByLabelText(STYLE);
    expect(style).toHaveValue('plan');
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'MONDARTH-EMMA.Report.Styles.plan',
      'MONDARTH-EMMA.Report.Styles.check',
      'MONDARTH-EMMA.Report.Styles.update',
    ]);
    const download = screen.getByRole('button', { name: DOWNLOAD });
    expect(style.nextElementSibling).toBe(download);
    expect(download).toHaveAttribute('data-tooltip', DOWNLOAD);
  });

  test('plans the active modules in two numbered lists of ID, name and manifest URL: changes, then those kept', () => {
    renderReport();

    expect(region('Plan')).toHaveTextContent(SUMMARY);
    const changes = screen.getByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Changes' });
    const kept = screen.getByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Kept' });
    expect(changes.compareDocumentPosition(kept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const header =
      '    MONDARTH-EMMA.Report.Plan.Id  MONDARTH-EMMA.Report.Plan.Name  MONDARTH-EMMA.Report.Plan.Manifest';
    expect(changes.querySelector('pre')?.textContent).toBe(
      `${header}\n1.  midi-qol                      Midi QOL                        MONDARTH-EMMA.Report.Plan.NoManifest`,
    );
    expect(kept.querySelector('pre')?.textContent).toBe(
      `${header}\n1.  lib-wrapper                   libWrapper                      https://example.test/lib.json`,
    );
  });

  test('says when a list of the plan is empty', () => {
    renderReport({ plan: [{ id: 'lib-wrapper', title: 'libWrapper', changes: false, manifest: null }] });

    const changes = screen.getByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Changes' });
    expect(changes).toHaveTextContent('MONDARTH-EMMA.Report.Plan.NoChanges');
    expect(changes.querySelector('pre')).toBeNull();
  });

  test('says when no module is active, in the plan and the check', async () => {
    renderReport({ plan: [], check: { ...CHECK, valid: true, modules: [] } });

    expect(region('Plan')).toHaveTextContent('MONDARTH-EMMA.Report.Plan.Empty');
    expect(region('Plan').querySelector('pre')).toBeNull();
    await show('check');
    expect(region('Check')).toHaveTextContent('MONDARTH-EMMA.Report.Plan.Empty');
    expect(region('Check').querySelector('.emma-report-verdict')).toHaveClass('valid');
  });

  test('checks every active module, with its badge, its verdict and every note', async () => {
    renderReport();

    await show('check');

    const check = region('Check');
    expect(check).toHaveTextContent(SUMMARY);
    expect(check.querySelector('.emma-report-verdict')).toHaveClass('invalid');
    expect(check).toHaveTextContent('MONDARTH-EMMA.Report.Check.Invalid');
    const [lib, midi] = check.querySelectorAll('.emma-report-packages > li');
    expect(lib).toHaveTextContent('libWrapper');
    expect(lib).toHaveTextContent('MONDARTH-EMMA.Report.Check.Nothing');
    expect(lib?.querySelector('.emma-report-verdict-text')).toBeNull();
    expect(midi?.querySelector('.emma-badge.warning')).toHaveTextContent('13.0.2');
    expect(midi?.querySelector('.emma-report-verdict-text')).toHaveTextContent('Unverified');
    expect(midi).toHaveTextContent('Midi QOL 13.0.2 is not verified with dnd5e 6.0.0.');
    expect(screen.queryByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Heading' })).toBeNull();
  });

  test('shows it is resolving until the solve is done, and cannot download that until then', async () => {
    renderReport();

    await show('update');

    expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Loading');
    expect(screen.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
  });

  test('lists what the best setup changes and adds, and what could not be loaded', async () => {
    renderReport({
      solve: Promise.resolve({
        solution: {
          kind: 'found',
          changes: [
            { package: { type: 'module', id: 'lib' }, title: 'Lib', from: '1.0.0', to: '2.0.0' },
            { package: { type: 'module', id: 'helper' }, title: 'Helper', from: null, to: '1.0.0' },
          ],
        },
        unloaded: ['dae 13.0.5'],
      }),
    });

    await show('update');

    const resolve = region('Solve');
    await vi.waitFor(() => {
      expect(resolve).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Changes');
    });
    expect([...resolve.querySelectorAll('.emma-report-changes li')].map(item => item.textContent.trim())).toEqual([
      'MONDARTH-EMMA.Report.Solve.Change {"package":"Lib","from":"1.0.0","to":"2.0.0"}',
      'MONDARTH-EMMA.Report.Solve.Add {"package":"Helper","version":"1.0.0"}',
    ]);
    expect(resolve).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Unloaded {"packages":"dae 13.0.5"}');
  });

  test('says when the setup chosen needs nothing changed', async () => {
    renderReport({ solve: Promise.resolve({ solution: { kind: 'found', changes: [] }, unloaded: [] }) });

    await show('update');

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.NoChanges');
    });
    expect(region('Solve').querySelector('.emma-report-changes')).toBeNull();
  });

  test('explains why no setup keeps the versions chosen', async () => {
    renderReport({
      solve: Promise.resolve({ solution: { kind: 'none', lines: ['First.', 'Second. (1)'] }, unloaded: [] }),
    });

    await show('update');

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.None');
    });
    expect([...region('Solve').querySelectorAll('.emma-report-explanation li')].map(item => item.textContent)).toEqual([
      'First.',
      'Second. (1)',
    ]);
  });

  test('names the manifests it needs to answer', async () => {
    renderReport({ solve: Promise.resolve({ solution: { kind: 'undecided', needs: ['addon 2.0.0'] }, unloaded: [] }) });

    await show('update');

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Undecided {"packages":"addon 2.0.0"}');
    });
  });

  test('says when the solve failed, logging why, and has nothing to download', async () => {
    const failure = new Error('broken');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderReport({ solve: Promise.reject(failure) });

    await show('update');

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Failed');
    });
    expect(screen.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to work out the best versions', failure);
  });

  test('downloads the report shown, as text', async () => {
    const onDownload = renderReport({
      solve: Promise.resolve({ solution: { kind: 'found', changes: [] }, unloaded: [] }),
    });
    const download = screen.getByRole('button', { name: DOWNLOAD });

    await userEvent.click(download);
    await show('check');
    await userEvent.click(download);
    await show('update');
    await vi.waitFor(() => {
      expect(download).toBeEnabled();
    });
    await userEvent.click(download);

    const calls = onDownload.mock.calls as [string, string][];
    expect(calls.map(([text, style]) => [text.split('\n')[0], style])).toEqual([
      ['MONDARTH-EMMA.Report.Plan.Heading', 'plan'],
      ['MONDARTH-EMMA.Report.Check.Heading', 'check'],
      ['MONDARTH-EMMA.Report.Solve.Heading', 'update'],
    ]);
  });

  test('ignores a solve that finishes after it is gone', async () => {
    let finish = (_solved: SetupSolve): void => undefined;
    const { unmount } = render(SetupReport, {
      ignored: [],
      plan: PLAN,
      check: CHECK,
      solve: new Promise<SetupSolve>(resolve => {
        finish = resolve;
      }),
      onDownload: vi.fn(),
      apply: vi.fn(),
    });
    let fail = (_error: Error): void => undefined;
    const failing = render(SetupReport, {
      ignored: [],
      plan: PLAN,
      check: CHECK,
      solve: new Promise<SetupSolve>((_resolve, reject) => {
        fail = reject;
      }),
      onDownload: vi.fn(),
      apply: vi.fn(),
    });

    unmount();
    failing.unmount();
    finish({ solution: { kind: 'found', changes: [] }, unloaded: [] });
    fail(new Error('late'));
    await Promise.resolve();

    expect(document.querySelector('.emma-report')).toBeNull();
  });

  describe('choosing the versions recommended', () => {
    const APPLY = 'MONDARTH-EMMA.Report.Apply';
    const CHANGES = [
      { package: { type: 'core' as const, id: 'core' }, title: 'Foundry', from: '14.368', to: '14.369' },
      { package: { type: 'module' as const, id: 'lib' }, title: 'Lib', from: '1.0.0', to: '2.0.0' },
    ];

    test('is offered left of the download, in the update only, once it changes something', async () => {
      renderReport({ solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }) });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();

      await show('update');

      const choose = await screen.findByRole('button', { name: APPLY });
      expect(choose.nextElementSibling).toBe(screen.getByRole('button', { name: DOWNLOAD }));
      expect(choose).toHaveAttribute('data-tooltip', APPLY);
      await show('check');
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
    });

    test('chooses the versions recommended, then reports on the setup they make in every style', async () => {
      const after: SetupReportData = {
        ignored: [],
        plan: [{ id: 'lib', title: 'Lib', changes: true, manifest: 'https://example.test/lib/2.0.0' }],
        check: { ...CHECK, valid: true, modules: [{ ...CHECK.modules[0], version: '2.0.0' } as ReportedPackage] },
        solve: Promise.resolve({ solution: { kind: 'found', changes: [] }, unloaded: [] }),
        apply: vi.fn(),
      };
      const { apply } = renderReport({
        solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }),
      });
      apply.mockReturnValue(after);
      await show('update');

      await userEvent.click(await screen.findByRole('button', { name: APPLY }));

      expect(apply).toHaveBeenCalledExactlyOnceWith(CHANGES);
      // The update is worked out again: nothing is left to change, so there is nothing more to choose.
      await vi.waitFor(() => {
        expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.NoChanges');
      });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
      await show('plan');
      expect(region('Plan')).toHaveTextContent('https://example.test/lib/2.0.0');
      await show('check');
      expect(region('Check')).toHaveTextContent('MONDARTH-EMMA.Report.Check.Valid');
      expect(region('Check').querySelector('.emma-report-packages > li')).toHaveTextContent('2.0.0');
    });

    test('shows that it is working out the update again, after choosing', async () => {
      const { apply } = renderReport({
        solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }),
      });
      apply.mockReturnValue({
        ignored: [],
        plan: PLAN,
        check: CHECK,
        solve: new Promise(() => undefined),
        apply: vi.fn(),
      });
      await show('update');

      await userEvent.click(await screen.findByRole('button', { name: APPLY }));

      expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Loading');
      expect(screen.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
    });

    test('is not offered when nothing would change, or no setup was found', async () => {
      renderReport({ solve: Promise.resolve({ solution: { kind: 'found', changes: [] }, unloaded: [] }) });
      await show('update');
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
      });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();

      document.body.replaceChildren();
      renderReport({ solve: Promise.resolve({ solution: { kind: 'none', lines: ['No.'] }, unloaded: [] }) });
      await show('update');
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
      });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
    });
  });

  describe('with modules hypothetical mode ignores', () => {
    const WARNING = 'MONDARTH-EMMA.Report.Ignored {"modules":"Coven’s Automation Toolkit"}';

    test('warns in every style that it leaves them out, and may be inaccurate', async () => {
      renderReport({ ignored: ['Coven’s Automation Toolkit'] });

      expect(screen.getByRole('note')).toHaveTextContent(WARNING);
      await show('check');
      expect(screen.getByRole('note')).toHaveTextContent(WARNING);
      await show('update');
      expect(screen.getByRole('note')).toHaveTextContent(WARNING);
    });

    test('puts the warning first in the text downloaded', async () => {
      const onDownload = renderReport({ ignored: ['Coven’s Automation Toolkit'] });

      await userEvent.click(screen.getByRole('button', { name: DOWNLOAD }));

      expect(onDownload.mock.lastCall?.[0]).toMatch(new RegExp(`^${WARNING.replace(/[{}()]/g, '\\$&')}\n\n`));
    });

    test('warns of nothing when none is ignored', () => {
      renderReport();

      expect(screen.queryByRole('note')).toBeNull();
    });
  });
});
