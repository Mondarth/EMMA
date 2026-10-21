import { screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { SetupCheck, SetupSolve } from '@module/adapters/report';
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
 * @param solve - The solve; resolved by default
 * @returns The report
 */
function report(
  solve: Promise<SetupSolve> = Promise.resolve({ solution: { kind: 'found', changes: [] }, unloaded: [] }),
) {
  return { plan: [], check: CHECK, solve, apply: vi.fn() };
}

describe('SetupReportApp', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('is a resizable window titled from the localization file', async () => {
    const { SetupReportApp } = await loadReport();

    const app = new SetupReportApp(report());

    expect(app.options).toMatchObject({
      id: 'mondarth-emma-report',
      window: { title: 'MONDARTH-EMMA.Report.Title', icon: 'fa-solid fa-clipboard-list', resizable: true },
    });
  });

  test('shows the report once across re-renders, and leaves nothing behind when closed', async () => {
    const { SetupReportApp } = await loadReport();
    const app = new SetupReportApp(report());

    await app.render({ force: true });
    await app.render();
    expect(document.querySelectorAll('.emma-report')).toHaveLength(1);

    await app.close();
    expect(document.querySelector('.emma-report')).toBeNull();
    await expect(app.close()).resolves.toBe(app);
  });
});

describe('downloading', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('saves the report shown as a text file named for its style', async () => {
    const { SetupReportApp, foundry } = await loadReport();
    await new SetupReportApp(report()).render({ force: true });

    await userEvent.click(screen.getByRole('button', { name: 'MONDARTH-EMMA.Report.Download' }));

    expect(foundry.saveDataToFile).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^MONDARTH-EMMA\.Report\.Plan\.Heading\n/),
      'text/plain',
      'emma-plan.txt',
    );
  });
});

describe('showSetupReport', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('shows a report in place of the one open', async () => {
    const { showSetupReport } = await loadReport();

    await showSetupReport(report());
    await showSetupReport({ ...report(), check: { ...CHECK, setup: { ...CHECK.setup, modules: 7 } } });

    expect(document.querySelectorAll('.emma-report')).toHaveLength(1);
    expect(screen.getByText(/"count":"7"/)).toBeInTheDocument();
  });
});

describe('closeSetupReport', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('closes the report open, and is harmless with none', async () => {
    const { showSetupReport, closeSetupReport } = await loadReport();
    await closeSetupReport();

    await showSetupReport(report());
    await closeSetupReport();

    expect(document.querySelector('.emma-report')).toBeNull();
  });
});
