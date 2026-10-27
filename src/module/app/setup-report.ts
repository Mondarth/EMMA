import { mount, unmount } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

import SetupReport from '@component/SetupReport.svelte';
import type { SetupChange, SetupReportData } from '@module/adapters/report';
import { MODULE_ID } from '@module/lib/constants';
import type { ReportStyle } from '@module/lib/report-text';
import { REPORT_ICONS, REPORT_STYLES } from '@module/lib/report-text';

/** A report on a setup, as its window shows it. */
export type { SetupReportData } from '@module/adapters/report';

/** One of the reports, each shown in its own window. */
export type { ReportStyle } from '@module/lib/report-text';

/** The reports' windows, as EMMA's window opens and closes them; each can be open beside the others. */
export interface SetupReports {
  /** The reports open, read reactively. */
  readonly open: ReadonlySet<ReportStyle>;
  /**
   * Show a report, in place of the same report if it is open.
   * @param style - Which report
   * @param report - What it reports
   */
  show(style: ReportStyle, report: SetupReportData): void;
  /**
   * Close a report, if it is open.
   * @param style - Which report
   */
  close(style: ReportStyle): void;
  /** Close every report open. */
  closeAll(): void;
}

/** The size a report's window opens at. */
const SIZE = { width: 560, height: 600 };

/** How far each report's window opens from the one before it, so that those open together do not hide each other. */
const CASCADE = 32;

/**
 * A window showing one report on the setup chosen in hypothetical mode, opened from EMMA's toolbar. As with
 * {@link EmmaApp}, its content is a Svelte component, {@link SetupReport}, mounted on first render and unmounted on
 * close. It reports on the setup as it was when opened, until the update's versions are chosen: every report open then
 * follows them. The report can be downloaded as text.
 */
export class SetupReportApp extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    classes: [MODULE_ID],
  };

  readonly #style: ReportStyle;

  #report: SetupReportData;

  /** The mounted report, while the window is open. */
  #component: ReturnType<typeof mount> | null = null;

  /** Shows another report in the mounted one's place, once it is mounted. */
  #show: ((report: SetupReportData) => void) | null = null;

  /**
   * @param style - Which report it shows
   * @param report - What it reports
   * @param options - Options for the window
   */
  constructor(
    style: ReportStyle,
    report: SetupReportData,
    options: ConstructorParameters<typeof foundry.applications.api.ApplicationV2>[0] = {},
  ) {
    const offset = REPORT_STYLES.indexOf(style) * CASCADE;
    super({
      id: `${MODULE_ID}-report-${style}`,
      window: {
        title: `MONDARTH-EMMA.Report.Titles.${style}`,
        icon: `fa-solid ${REPORT_ICONS[style]}`,
        resizable: true,
      },
      position: {
        ...SIZE,
        left: Math.max(0, (window.innerWidth - SIZE.width) / 2 + offset),
        top: Math.max(0, (window.innerHeight - SIZE.height) / 2 + offset),
      },
      ...options,
    });
    this.#style = style;
    this.#report = report;
  }

  /**
   * Show another report on the setup, as when the update's versions are chosen.
   * @param report - What it reports
   */
  setReport(report: SetupReportData): void {
    this.#report = report;
    this.#show?.(report);
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
        style: this.#style,
        report: this.#report,
        follow: (show: (report: SetupReportData) => void) => {
          this.#show = show;
        },
        onDownload: (text: string, style: ReportStyle) => {
          foundry.utils.saveDataToFile(text, 'text/plain', `emma-${style}.txt`);
        },
        onApply: (changes: readonly SetupChange[]) => {
          // Every report open then reports on the setup the versions chosen make.
          const next = this.#report.apply(changes);
          for (const app of shown.values()) app.setReport(next);
        },
      },
    });
  }

  /**
   * Unmount the report, releasing its listeners and effects, and forget it was open.
   * @param options - Options passed to `close`
   */
  protected override async _onClose(
    options: Parameters<foundry.applications.api.ApplicationV2['_onClose']>[0],
  ): Promise<void> {
    await super._onClose(options);
    forget(this.#style, this);
    if (this.#component === null) return;
    void unmount(this.#component);
    this.#component = null;
    this.#show = null;
  }
}

/** The report windows open, by report. */
const shown = new Map<ReportStyle, SetupReportApp>();

/** The reports open, for the toolbar's buttons to show. */
const opened = new SvelteSet<ReportStyle>();

/** The reports open, read reactively. */
export const openSetupReports: ReadonlySet<ReportStyle> = opened;

/**
 * Forget a report's window, unless another has taken its place.
 * @param style - Which report
 * @param app - Its window
 */
function forget(style: ReportStyle, app: SetupReportApp): void {
  if (shown.get(style) !== app) return;
  shown.delete(style);
  opened.delete(style);
}

/**
 * Show a report, in place of the same report if it is open; the others stay open.
 * @param style - Which report
 * @param report - What it reports
 * @returns Once the window is rendered
 */
export async function showSetupReport(style: ReportStyle, report: SetupReportData): Promise<void> {
  await shown.get(style)?.close();
  const app = new SetupReportApp(style, report);
  shown.set(style, app);
  opened.add(style);
  try {
    await app.render({ force: true });
  } catch (error) {
    forget(style, app);
    throw error;
  }
}

/**
 * Close a report, if it is open.
 * @param style - Which report
 * @returns Once it is closed
 */
export async function closeSetupReport(style: ReportStyle): Promise<void> {
  await shown.get(style)?.close();
}

/**
 * Close every report open, as when the hypothetical setup they report on goes.
 * @returns Once they are closed
 */
export async function closeSetupReports(): Promise<void> {
  await Promise.all([...shown.values()].map(app => app.close()));
}
