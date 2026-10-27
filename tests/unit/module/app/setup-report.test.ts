import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { SetupChange, SetupCheck, SetupReportData, SetupSolve } from '@module/adapters/report';
import { installFoundryMocks } from '../../mocks/foundry';

const CHECK: SetupCheck = {
  setup: { core: '14.368', system: 'dnd5e 5.1.0', modules: 1 },
  valid: true,
  modules: [],
};

/**
 * Install the Foundry mocks, then load a fresh copy of the report's module, whose window extends the mocked
 * `ApplicationV2`.
 * @returns The module and the installed mocks
 */
async function loadReport() {
  const mocks = installFoundryMocks();
  vi.resetModules();
  return { ...(await import('@module/app/setup-report')), ...mocks };
}

/**
 * A report whose solve resolves to nothing to change.
 * @param modules - How many modules its setup has
 * @returns The report, whose `apply` is a mock
 */
function report(modules = 1) {
  return {
    ignored: [],
    unavailable: [],
    plan: [],
    check: { ...CHECK, setup: { ...CHECK.setup, modules } },
    solve: (): Promise<SetupSolve> => Promise.resolve({ solution: { kind: 'found', changes: [] }, unloaded: [] }),
    apply: vi.fn((_changes: readonly SetupChange[]): SetupReportData => report()),
  };
}

/**
 * The window of a report.
 * @param style - Which report
 * @returns Its window, if open
 */
function windowOf(style: string): HTMLElement | null {
  return document.getElementById(`mondarth-emma-report-${style}`);
}

describe('SetupReportApp', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test.each([
    ['plan', 'fa-list-ol'],
    ['check', 'fa-clipboard-check'],
    ['update', 'fa-circle-arrow-up'],
  ] as const)(
    'shows the %s in a resizable window of its own, titled from the localization file',
    async (style, icon) => {
      const { SetupReportApp } = await loadReport();

      const app = new SetupReportApp(style, report());

      expect(app.options).toMatchObject({
        id: `mondarth-emma-report-${style}`,
        window: { title: `MONDARTH-EMMA.Report.Titles.${style}`, icon: `fa-solid ${icon}`, resizable: true },
      });
    },
  );

  test('opens each report a little further along than the one before, so they do not hide each other', async () => {
    const { SetupReportApp } = await loadReport();

    const [plan, check, update] = (['plan', 'check', 'update'] as const).map(
      style => (new SetupReportApp(style, report()).options as { position: { left: number; top: number } }).position,
    );

    expect(check?.left).toBe((plan?.left ?? 0) + 32);
    expect(check?.top).toBe((plan?.top ?? 0) + 32);
    expect(update?.left).toBe((plan?.left ?? 0) + 64);
  });

  test('shows the report once across re-renders, and leaves nothing behind when closed', async () => {
    const { SetupReportApp } = await loadReport();
    const app = new SetupReportApp('plan', report());

    await app.render({ force: true });
    await app.render();
    expect(document.querySelectorAll('.emma-report')).toHaveLength(1);

    await app.close();
    expect(document.querySelector('.emma-report')).toBeNull();
    await expect(app.close()).resolves.toBe(app);
  });

  test('takes another report before it is shown', async () => {
    const { SetupReportApp } = await loadReport();
    const app = new SetupReportApp('check', report());

    app.setReport(report(7));
    await app.render({ force: true });

    expect(screen.getByText(/"count":"7"/)).toBeInTheDocument();
  });
});

describe('reportPosition', () => {
  /**
   * Where EMMA's window and toolbar are.
   * @param left - The window's left edge
   * @param width - The window's width
   * @returns The anchor
   */
  function anchor(left: number, width: number) {
    return {
      window: new DOMRect(left, 50, width, 700),
      toolbar: new DOMRect(left, 80, width, 40),
    };
  }

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
  });

  test('opens beside EMMA’s window when every report fits there, each a little further along', async () => {
    const { reportPosition } = await loadReport();

    expect(reportPosition('plan', anchor(100, 800))).toEqual({ left: 908, top: 50, width: 560, height: 600 });
    expect(reportPosition('update', anchor(100, 800))).toEqual({ left: 972, top: 114, width: 560, height: 600 });
  });

  test('opens just below EMMA’s toolbar when there is no room beside it, as tall as fits on the screen', async () => {
    const { reportPosition } = await loadReport();
    vi.stubGlobal('innerHeight', 600);

    expect(reportPosition('check', anchor(400, 1200))).toEqual({ left: 440, top: 160, width: 560, height: 440 });
  });

  test('opens in the middle of the screen without EMMA’s window, never off its top or left', async () => {
    const { reportPosition } = await loadReport();

    expect(reportPosition('plan')).toEqual({ left: 680, top: 240, width: 560, height: 600 });
    vi.stubGlobal('innerWidth', 400);
    vi.stubGlobal('innerHeight', 300);
    expect(reportPosition('plan')).toEqual({ left: 0, top: 0, width: 560, height: 300 });
  });
});

describe('downloading', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('saves the report as a text file named for it', async () => {
    const { SetupReportApp, foundry } = await loadReport();
    await new SetupReportApp('check', report()).render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Report.Download' }));

    expect(foundry.saveDataToFile).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^MONDARTH-EMMA\.Report\.Check\.Heading\n/),
      'text/plain',
      'emma-check.txt',
    );
  });
});

describe('showSetupReport', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('shows each report in its own window, beside the others, marking each open', async () => {
    const { showSetupReport, openSetupReports } = await loadReport();

    await showSetupReport('plan', report());
    await showSetupReport('check', report());

    expect(windowOf('plan')).not.toBeNull();
    expect(windowOf('check')).not.toBeNull();
    expect([...openSetupReports]).toEqual(['plan', 'check']);
  });

  test('shows a report in place of the same one open', async () => {
    const { showSetupReport, openSetupReports } = await loadReport();

    await showSetupReport('plan', report());
    await showSetupReport('plan', report(7));

    expect(document.querySelectorAll('.emma-report')).toHaveLength(1);
    expect(screen.getByText(/"count":"7"/)).toBeInTheDocument();
    expect([...openSetupReports]).toEqual(['plan']);
  });

  test('forgets a report that fails to open', async () => {
    const { showSetupReport, openSetupReports, SetupReportApp } = await loadReport();
    const failure = new Error('broken');
    vi.spyOn(SetupReportApp.prototype, 'render').mockRejectedValueOnce(failure);

    await expect(showSetupReport('plan', report())).rejects.toBe(failure);

    expect([...openSetupReports]).toEqual([]);
  });

  test('forgets a report closed from its own window, but not one shown in its place', async () => {
    const { showSetupReport, openSetupReports, SetupReportApp } = await loadReport();
    const render = vi.spyOn(SetupReportApp.prototype, 'render');
    await showSetupReport('update', report());
    await showSetupReport('update', report());
    const [replaced, replacing] = render.mock.contexts as InstanceType<typeof SetupReportApp>[];

    await replaced?.close();
    expect([...openSetupReports]).toEqual(['update']);
    await replacing?.close();
    expect([...openSetupReports]).toEqual([]);
  });

  test('has every report open follow the versions the update chooses', async () => {
    const { showSetupReport } = await loadReport();
    const solving = report();
    const changes: SetupChange[] = [
      { package: { type: 'module', id: 'lib' }, title: 'Lib', from: '1.0.0', to: '2.0.0' },
    ];
    const update = {
      ...solving,
      solve: (): Promise<SetupSolve> => Promise.resolve({ solution: { kind: 'found', changes }, unloaded: [] }),
    };
    update.apply.mockReturnValue(report(9));
    await showSetupReport('plan', report());
    await showSetupReport('check', report());
    await showSetupReport('update', update);

    await userEvent.click(await screen.findByRole('button', { name: 'MONDARTH-EMMA.Report.Apply' }));

    expect(update.apply).toHaveBeenCalledExactlyOnceWith(changes);
    await vi.waitFor(() => {
      for (const style of ['plan', 'check', 'update']) expect(windowOf(style)).toHaveTextContent(/"count":"9"/);
    });
  });
});

describe('closeSetupReport', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('closes the report, leaving the others open, and is harmless with it closed', async () => {
    const { showSetupReport, closeSetupReport, openSetupReports } = await loadReport();
    await closeSetupReport('plan');
    await showSetupReport('plan', report());
    await showSetupReport('check', report());

    await closeSetupReport('plan');

    expect(windowOf('plan')).toBeNull();
    expect(windowOf('check')).not.toBeNull();
    expect([...openSetupReports]).toEqual(['check']);
  });
});

describe('closeSetupReports', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('closes every report open, and is harmless with none', async () => {
    const { showSetupReport, closeSetupReports, openSetupReports } = await loadReport();
    await closeSetupReports();
    await showSetupReport('plan', report());
    await showSetupReport('update', report());

    await closeSetupReports();

    expect(document.querySelector('.emma-report')).toBeNull();
    expect([...openSetupReports]).toEqual([]);
  });
});
