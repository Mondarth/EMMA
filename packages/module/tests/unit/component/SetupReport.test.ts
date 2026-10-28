import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import SetupReport from '@component/SetupReport.svelte';
import type {
  PlanEntry,
  ReportedPackage,
  SetupChange,
  SetupCheck,
  SetupReportData,
  SetupSolve,
  UnavailableModule,
} from '@module/adapters/report';
import type { ReportStyle } from '@module/lib/report-text';
import { installFoundryMocks } from '../mocks/foundry';

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

/** The update's solve, its best versions, once worked out. */
const SOLVED: SetupSolve = { solution: { kind: 'found', changes: [] }, unloaded: [] };

/**
 * A report on a setup.
 * @param options - What it reports, by default the plan and check above and a solve that never ends
 * @param options.solve - What its solve gives
 * @param options.check - The check
 * @param options.plan - The plan
 * @param options.ignored - The titles of the modules hypothetical mode ignores; none by default
 * @param options.unavailable - The active modules that cannot be had; none by default
 * @returns The report, whose `solve` and `apply` are mocks
 */
function reportOf({
  solve = new Promise<SetupSolve>(() => undefined),
  check = CHECK,
  plan = PLAN,
  ignored = [],
  unavailable = [],
}: {
  solve?: Promise<SetupSolve>;
  check?: SetupCheck;
  plan?: PlanEntry[];
  ignored?: readonly string[];
  unavailable?: readonly UnavailableModule[];
} = {}) {
  return {
    ignored,
    unavailable,
    plan,
    check,
    solve: vi.fn((): Promise<SetupSolve> => solve),
    apply: vi.fn((_changes: readonly SetupChange[]): SetupReportData => reportOf()),
  };
}

/**
 * Render a report.
 * @param style - Which report
 * @param options - What it reports, as {@link reportOf} takes
 * @returns The download and apply handlers, the report, and the function that shows another in its place
 */
function renderReport(style: ReportStyle, options: Parameters<typeof reportOf>[0] = {}) {
  const report = reportOf(options);
  const onDownload = vi.fn();
  const onApply = vi.fn();
  let show = (_report: SetupReportData): void => undefined;
  const rendered = render(SetupReport, {
    style,
    report,
    follow: (follow: (next: SetupReportData) => void) => {
      show = follow;
    },
    onDownload,
    onApply,
  });
  return {
    onDownload,
    onApply,
    report,
    unmount: rendered.unmount,
    show: (next: SetupReportData) => {
      show(next);
    },
  };
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

  test('offers no choice of report, only its download', () => {
    renderReport('plan');

    expect(screen.queryByRole('combobox')).toBeNull();
    const download = screen.getByRole('button', { name: DOWNLOAD });
    expect(screen.getAllByRole('button')).toEqual([download]);
    expect(download).toHaveAttribute('data-tooltip', DOWNLOAD);
  });

  test('shows only its own report', () => {
    renderReport('check');

    expect(region('Check')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Heading' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'MONDARTH-EMMA.Report.Solve.Heading' })).toBeNull();
  });

  test('plans the active modules in two numbered lists of ID, name and manifest URL: changes, then those kept', () => {
    renderReport('plan');

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
    renderReport('plan', { plan: [{ id: 'lib-wrapper', title: 'libWrapper', changes: false, manifest: null }] });

    const changes = screen.getByRole('region', { name: 'MONDARTH-EMMA.Report.Plan.Changes' });
    expect(changes).toHaveTextContent('MONDARTH-EMMA.Report.Plan.NoChanges');
    expect(changes.querySelector('pre')).toBeNull();
  });

  test.each([
    ['plan', 'Plan'],
    ['check', 'Check'],
  ] as const)('says when no module is active, in the %s', (style, heading) => {
    renderReport(style, { plan: [], check: { ...CHECK, valid: true, modules: [] } });

    expect(region(heading)).toHaveTextContent('MONDARTH-EMMA.Report.Plan.Empty');
    expect(region(heading).querySelector('pre')).toBeNull();
    if (style === 'check') expect(region(heading).querySelector('.emma-report-verdict')).toHaveClass('valid');
  });

  test('checks every active module, with its badge, its verdict and every note', () => {
    renderReport('check');

    const check = region('Check');
    expect(check).toHaveTextContent(SUMMARY);
    expect(check.querySelector('.emma-report-verdict')).toHaveClass('invalid');
    expect(check).toHaveTextContent('MONDARTH-EMMA.Report.Check.Invalid');
    const [midi, lib] = check.querySelectorAll('.emma-report-packages > li');
    expect(midi?.querySelector('.emma-badge.warning')).toHaveTextContent('13.0.2');
    expect(midi?.querySelector('.emma-report-verdict-text')).toHaveTextContent('Unverified');
    expect(midi).toHaveTextContent('Midi QOL 13.0.2 is not verified with dnd5e 6.0.0.');
    expect(lib).toHaveTextContent('libWrapper');
    expect(lib?.querySelector('.emma-report-verdict-text')).toBeNull();
  });

  /**
   * The folded-away group of modules the check found nothing to report on.
   * @param count - How many it should hold
   * @returns The group, if there is one
   */
  const quietGroup = (count: number) =>
    screen
      .queryByText(`MONDARTH-EMMA.Report.Check.NothingCount {"count":"${String(count)}"}`, { selector: 'summary' })
      ?.closest('details') ?? null;

  test('groups the modules it found nothing to report on after the others, folded away, opened on request', async () => {
    renderReport('check', {
      check: {
        ...CHECK,
        modules: [
          ...CHECK.modules,
          { id: 'dice', title: 'Dice', version: '5.2.4', badge: CHECK.modules[1]?.badge ?? null, notes: [] },
        ],
      },
    });

    const quiet = quietGroup(2);
    expect(quiet).not.toBeNull();
    expect(quiet?.open).toBe(false);
    const listed = [...(quiet?.querySelectorAll('li') ?? [])];
    expect(listed.map(item => item.querySelector('strong')?.textContent)).toEqual(['libWrapper', 'Dice']);
    expect(listed[1]?.querySelector('.emma-badge')).toHaveTextContent('5.2.4');
    expect(listed[1]?.querySelector('.emma-report-verdict-text')).toHaveTextContent('Unverified');
    // Said once, for them all, after the modules with something to report.
    expect(quiet?.querySelectorAll('.emma-report-notes')).toHaveLength(0);
    const midi = screen.getByText('Midi QOL', { selector: 'strong' });
    expect(quiet && midi.compareDocumentPosition(quiet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(screen.getByText(/NothingCount/, { selector: 'summary' }));

    expect(quiet?.open).toBe(true);
  });

  test('has no such group when every module has something to report, nor others when none does', () => {
    renderReport('check', { check: { ...CHECK, modules: CHECK.modules.slice(1) } });
    expect(screen.queryByText(/NothingCount/, { selector: 'summary' })).toBeNull();

    document.body.replaceChildren();
    renderReport('check', { check: { ...CHECK, modules: CHECK.modules.slice(0, 1) } });
    expect(region('Check').querySelectorAll('.emma-report-packages')).toHaveLength(1);
    expect(quietGroup(1)).toHaveTextContent('libWrapper');
  });

  test.each(['plan', 'check'] as const)('asks for no solve in the %s', style => {
    const { report } = renderReport(style);

    expect(report.solve).not.toHaveBeenCalled();
  });

  test('shows it is resolving until the solve is done, and cannot download that until then', () => {
    const { report } = renderReport('update');

    expect(report.solve).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Loading');
    expect(screen.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
  });

  test('lists what the best setup changes and adds, and what could not be loaded', async () => {
    renderReport('update', {
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
    renderReport('update', { solve: Promise.resolve(SOLVED) });

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.NoChanges');
    });
    expect(region('Solve').querySelector('.emma-report-changes')).toBeNull();
  });

  test('explains why no setup keeps the versions chosen', async () => {
    renderReport('update', {
      solve: Promise.resolve({ solution: { kind: 'none', lines: ['First.', 'Second. (1)'] }, unloaded: [] }),
    });

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.None');
    });
    expect([...region('Solve').querySelectorAll('.emma-report-explanation li')].map(item => item.textContent)).toEqual([
      'First.',
      'Second. (1)',
    ]);
  });

  test('names the manifests it needs to answer', async () => {
    renderReport('update', {
      solve: Promise.resolve({ solution: { kind: 'undecided', needs: ['addon 2.0.0'] }, unloaded: [] }),
    });

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Undecided {"packages":"addon 2.0.0"}');
    });
  });

  test('says when the solve failed, logging why, and has nothing to download', async () => {
    const failure = new Error('broken');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderReport('update', { solve: Promise.reject(failure) });

    await vi.waitFor(() => {
      expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Failed');
    });
    expect(screen.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', 'Unable to work out the best versions', failure);
  });

  test.each([
    ['plan', 'MONDARTH-EMMA.Report.Plan.Heading'],
    ['check', 'MONDARTH-EMMA.Report.Check.Heading'],
    ['update', 'MONDARTH-EMMA.Report.Solve.Heading'],
  ] as const)('downloads the %s, as text', async (style, heading) => {
    const { onDownload } = renderReport(style, { solve: Promise.resolve(SOLVED) });
    const download = screen.getByRole('button', { name: DOWNLOAD });
    await vi.waitFor(() => {
      expect(download).toBeEnabled();
    });

    await userEvent.click(download);

    const calls = onDownload.mock.calls as [string, string][];
    expect(calls.map(([text, called]) => [text.split('\n')[0], called])).toEqual([[heading, style]]);
  });

  test('ignores a solve that finishes after it is gone', async () => {
    let finish = (_solved: SetupSolve): void => undefined;
    const finishing = renderReport('update', {
      solve: new Promise<SetupSolve>(resolve => {
        finish = resolve;
      }),
    });
    let fail = (_error: Error): void => undefined;
    const failing = renderReport('update', {
      solve: new Promise<SetupSolve>((_resolve, reject) => {
        fail = reject;
      }),
    });

    finishing.unmount();
    failing.unmount();
    finish(SOLVED);
    fail(new Error('late'));
    await Promise.resolve();

    expect(document.querySelector('.emma-report')).toBeNull();
  });

  test.each([
    ['plan', 'Plan', 'https://example.test/lib/2.0.0'],
    ['check', 'Check', 'MONDARTH-EMMA.Report.Check.Valid'],
  ] as const)('shows another %s in its place when given one', (style, heading, shown) => {
    const { show } = renderReport(style);

    show({
      ...reportOf(),
      plan: [{ id: 'lib', title: 'Lib', changes: true, manifest: 'https://example.test/lib/2.0.0' }],
      check: { ...CHECK, valid: true },
    });

    return vi.waitFor(() => {
      expect(region(heading)).toHaveTextContent(shown);
    });
  });

  describe('choosing the versions recommended', () => {
    const APPLY = 'MONDARTH-EMMA.Report.Apply';
    const CHANGES = [
      { package: { type: 'core' as const, id: 'core' }, title: 'Foundry', from: '14.368', to: '14.369' },
      { package: { type: 'module' as const, id: 'lib' }, title: 'Lib', from: '1.0.0', to: '2.0.0' },
    ];

    test('is offered left of the download, in the update, once it changes something', async () => {
      renderReport('update', {
        solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }),
      });

      const choose = await screen.findByRole('button', { name: APPLY });
      expect(choose.nextElementSibling).toBe(screen.getByRole('button', { name: DOWNLOAD }));
      expect(choose).toHaveAttribute('data-tooltip', APPLY);
    });

    test.each(['plan', 'check'] as const)('is not offered in the %s', style => {
      renderReport(style, { solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }) });

      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
    });

    test('asks for the versions recommended to be chosen', async () => {
      const { onApply } = renderReport('update', {
        solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }),
      });

      await userEvent.click(await screen.findByRole('button', { name: APPLY }));

      expect(onApply).toHaveBeenCalledExactlyOnceWith(CHANGES);
    });

    test('works out the update of the report given in its place, showing it is working on it', async () => {
      const { show } = renderReport('update', {
        solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }),
      });
      await screen.findByRole('button', { name: APPLY });
      const after = reportOf();

      show(after);

      await vi.waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.Loading');
      });
      expect(after.solve).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
    });

    test('follows the setup the versions chosen make, with nothing more to choose', async () => {
      const { show } = renderReport('update', {
        solve: Promise.resolve({ solution: { kind: 'found', changes: CHANGES }, unloaded: [] }),
      });
      await screen.findByRole('button', { name: APPLY });
      const after: SetupReportData = {
        ...reportOf(),
        check: { ...CHECK, valid: true, modules: [{ ...CHECK.modules[0], version: '2.0.0' } as ReportedPackage] },
        solve: () => Promise.resolve(SOLVED),
      };

      show(after);

      await vi.waitFor(() => {
        expect(region('Solve')).toHaveTextContent('MONDARTH-EMMA.Report.Solve.NoChanges');
      });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
    });

    test('is not offered when nothing would change, or no setup was found', async () => {
      renderReport('update', { solve: Promise.resolve(SOLVED) });
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
      });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();

      document.body.replaceChildren();
      renderReport('update', { solve: Promise.resolve({ solution: { kind: 'none', lines: ['No.'] }, unloaded: [] }) });
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
      });
      expect(screen.queryByRole('button', { name: APPLY })).toBeNull();
    });
  });

  describe('with modules hypothetical mode ignores', () => {
    const WARNING = 'MONDARTH-EMMA.Report.Ignored {"modules":"Coven’s Automation Toolkit"}';

    test.each(['plan', 'check', 'update'] as const)(
      'warns in the %s that it leaves them out, and may be inaccurate',
      style => {
        renderReport(style, { ignored: ['Coven’s Automation Toolkit'] });

        expect(screen.getByRole('note')).toHaveTextContent(WARNING);
      },
    );

    test('puts the warning first in the text downloaded', async () => {
      const { onDownload } = renderReport('plan', { ignored: ['Coven’s Automation Toolkit'] });

      await userEvent.click(screen.getByRole('button', { name: DOWNLOAD }));

      const text: unknown = onDownload.mock.lastCall?.[0];
      expect(typeof text === 'string' && text.startsWith(`${WARNING}\n\n`)).toBe(true);
    });

    test('warns of nothing when none is ignored', () => {
      renderReport('plan');

      expect(screen.queryByRole('note')).toBeNull();
    });
  });

  describe('with active modules that cannot be had', () => {
    const UNAVAILABLE: UnavailableModule[] = [
      { title: 'Build-a-Bonus', reason: 'archived' },
      { title: 'Lost Module', reason: 'gone', note: 'Its repository was deleted.' },
    ];
    const LINES = [
      'MONDARTH-EMMA.Report.Unavailable.Entry {"title":"Build-a-Bonus","reason":"MONDARTH-EMMA.Report.Unavailable.archived"}',
      'MONDARTH-EMMA.Report.Unavailable.EntryNote {"title":"Lost Module","reason":"MONDARTH-EMMA.Report.Unavailable.gone","note":"Its repository was deleted."}',
    ];

    test.each(['plan', 'check', 'update'] as const)('names them, and why, in a section of the %s', style => {
      renderReport(style, { unavailable: UNAVAILABLE, solve: Promise.resolve(SOLVED) });

      const section = screen.getByRole('region', { name: 'MONDARTH-EMMA.Report.Unavailable.Heading' });
      expect(section).toHaveTextContent('MONDARTH-EMMA.Report.Unavailable.Intro');
      expect([...section.querySelectorAll('li')].map(item => item.textContent)).toEqual(LINES);
    });

    test.each([
      ['plan', 'Plan'],
      ['check', 'Check'],
      ['update', 'Solve'],
    ] as const)('ends the %s with the section, in the pane that scrolls', async (style, heading) => {
      renderReport(style, { unavailable: UNAVAILABLE, solve: Promise.resolve(SOLVED) });
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
      });

      const section = screen.getByRole('region', { name: 'MONDARTH-EMMA.Report.Unavailable.Heading' });
      expect(region(heading).lastElementChild).toBe(section);
    });

    test('ends the text downloaded with them', async () => {
      const { onDownload } = renderReport('check', { unavailable: UNAVAILABLE });

      await userEvent.click(screen.getByRole('button', { name: DOWNLOAD }));

      const text = String(onDownload.mock.lastCall?.[0]);
      expect(text.split('\n').slice(-5)).toEqual([
        '',
        'MONDARTH-EMMA.Report.Unavailable.Heading',
        'MONDARTH-EMMA.Report.Unavailable.Intro',
        ...LINES.map(line => `- ${line}`),
      ]);
    });

    test('has no such section when every module can be had', () => {
      renderReport('plan');

      expect(screen.queryByRole('region', { name: 'MONDARTH-EMMA.Report.Unavailable.Heading' })).toBeNull();
    });
  });
});
