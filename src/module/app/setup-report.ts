import { mount, unmount } from 'svelte';

import SetupReport from '@component/SetupReport.svelte';
import type { SetupReportData } from '@module/adapters/report';
import { MODULE_ID } from '@module/lib/constants';
import type { ReportStyle } from '@module/lib/report-text';

/** A report on a setup, as the window shows it. */
export type { SetupReportData } from '@module/adapters/report';

/**
 * The window reporting on the setup chosen in hypothetical mode, opened from EMMA's toolbar. As with {@link EmmaApp},
 * its content is a Svelte component, {@link SetupReport}, mounted on first render and unmounted on close. It reports on
 * the setup as it was when opened; opening it again reports afresh. The report shown can be downloaded as text.
 */
export class SetupReportApp extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-report`,
    classes: [MODULE_ID],
    window: {
      title: 'MONDARTH-EMMA.Report.Title',
      icon: 'fa-solid fa-clipboard-list',
      resizable: true,
    },
    position: { width: 560, height: 600 },
  };

  readonly #report: SetupReportData;

  /** The mounted report, while the window is open. */
  #component: ReturnType<typeof mount> | null = null;

  /**
   * @param report - The report to show
   * @param options - Options for the window
   */
  constructor(
    report: SetupReportData,
    options: ConstructorParameters<typeof foundry.applications.api.ApplicationV2>[0] = {},
  ) {
    super(options);
    this.#report = report;
  }

  /**
   * Nothing to render: the Svelte component owns the content.
   * @returns Nothing
   */
  protected override _renderHTML(): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Mount the report into the window content on first render.
   * @param _result - The (empty) result of {@link SetupReportApp._renderHTML}
   * @param content - The window's content element
   */
  protected override _replaceHTML(_result: unknown, content: HTMLElement): void {
    if (this.#component !== null) return;
    this.#component = mount(SetupReport, {
      target: content,
      props: {
        ...this.#report,
        onDownload: (text: string, style: ReportStyle) => {
          foundry.utils.saveDataToFile(text, 'text/plain', `emma-${style}.txt`);
        },
      },
    });
  }

  /**
   * Unmount the report, releasing its listeners and effects.
   * @param options - Options passed to `close`
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    if (this.#component === null) return;
    void unmount(this.#component);
    this.#component = null;
  }
}

/** The report window open, if any. */
let shown: SetupReportApp | null = null;

/**
 * Show a report, in place of any report already open.
 * @param report - The report
 * @returns Once the window is rendered
 */
export async function showSetupReport(report: SetupReportData): Promise<void> {
  await shown?.close();
  shown = new SetupReportApp(report);
  await shown.render({ force: true });
}

/**
 * Close the report open, if any, as when the hypothetical setup it reports on goes with EMMA's window.
 * @returns Once it is closed
 */
export async function closeSetupReport(): Promise<void> {
  await shown?.close();
  shown = null;
}
