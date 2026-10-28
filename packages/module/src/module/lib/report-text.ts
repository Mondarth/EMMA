/**
 * The setup report as plain text, for downloading, and for the plan's columns, which the report window shows as they
 * are written to the file.
 */
import type { PlanEntry, SetupCheck, SetupSolve, UnavailableModule } from '@module/adapters/report';

import { format, formatList, localize } from './i18n';

/** The reports, each in its own window, in the order the toolbar offers them. */
export const REPORT_STYLES = ['plan', 'check', 'update'] as const;

/** One of the reports. */
export type ReportStyle = (typeof REPORT_STYLES)[number];

/** Each report's Font Awesome icon, on its toolbar button and its window. */
export const REPORT_ICONS: Readonly<Record<ReportStyle, string>> = {
  plan: 'fa-list-ol',
  check: 'fa-clipboard-check',
  update: 'fa-circle-arrow-up',
};

/**
 * An active module that cannot be had, in a sentence: its title and why.
 * @param unavailable - The module
 * @param unavailable.title - Its title
 * @param unavailable.reason - Why it cannot be had
 * @param unavailable.note - More of why, if the catalogue says
 * @returns The sentence
 */
export function unavailableText({ title, reason, note }: UnavailableModule): string {
  const why = localize(`MONDARTH-EMMA.Report.Unavailable.${reason}`);
  return note === undefined
    ? format('MONDARTH-EMMA.Report.Unavailable.Entry', { title, reason: why })
    : format('MONDARTH-EMMA.Report.Unavailable.EntryNote', { title, reason: why, note });
}

/**
 * The section every report ends with when active modules cannot be had, as plain text.
 * @param unavailable - The modules
 * @returns Its lines, after a blank one; none when every module can be had
 */
export function unavailableLines(unavailable: readonly UnavailableModule[]): string[] {
  if (unavailable.length === 0) return [];
  return [
    '',
    localize('MONDARTH-EMMA.Report.Unavailable.Heading'),
    localize('MONDARTH-EMMA.Report.Unavailable.Intro'),
    ...indented('- ', unavailable.map(unavailableText)),
  ];
}

/** The setup a report is on, as {@link SetupCheck} gives it. */
type ReportedSetup = SetupCheck['setup'];

/**
 * The warning a report gives when hypothetical mode ignores some of the setup's modules, which it leaves out.
 * @param ignored - The titles of the modules ignored
 * @returns The warning, or `null` when none is ignored
 */
export function ignoredWarning(ignored: readonly string[]): string | null {
  return ignored.length === 0 ? null : format('MONDARTH-EMMA.Report.Ignored', { modules: formatList(ignored) });
}

/**
 * The setup a report is on, in a sentence.
 * @param setup - The setup
 * @returns The sentence
 */
export function setupSummary(setup: ReportedSetup): string {
  return format('MONDARTH-EMMA.Report.Setup', {
    core: setup.core,
    system: setup.system,
    count: String(setup.modules),
  });
}

/**
 * Text cut into lines, each starting with a prefix.
 * @param prefix - What starts each line
 * @param lines - The lines
 * @returns The lines, prefixed
 */
function indented(prefix: string, lines: readonly string[]): string[] {
  return lines.map(line => `${prefix}${line}`);
}

/** The plan's two lists: the modules whose versions change what is installed, and those kept as installed. */
export interface PlanTables {
  /** The lines of the modules to install, or `null` when there are none. */
  readonly changes: readonly string[] | null;
  /** The lines of the modules kept as installed, or `null` when there are none. */
  readonly kept: readonly string[] | null;
}

/**
 * The plan in two lists, each in numbered columns of ID, name and manifest URL under a header: first the modules whose
 * version changes what is installed, then those kept as installed, each in the plan's order. Both lists' columns are
 * padded to the widest entry of either, so they line up.
 * @param plan - The plan, in order
 * @returns The lines of each list, without trailing spaces
 */
export function planTables(plan: readonly PlanEntry[]): PlanTables {
  const column = (name: string) => localize(`MONDARTH-EMMA.Report.Plan.${name}`);
  const header = { number: '', id: column('Id'), title: column('Name'), manifest: column('Manifest') };
  const rowsOf = (entries: readonly PlanEntry[]) =>
    entries.map(({ id, title, manifest }, index) => ({
      number: `${String(index + 1)}.`,
      id,
      title,
      manifest: manifest ?? column('NoManifest'),
    }));
  const changes = rowsOf(plan.filter(entry => entry.changes));
  const kept = rowsOf(plan.filter(entry => !entry.changes));
  const rows = [header, ...changes, ...kept];
  const width = (key: 'number' | 'id' | 'title') => Math.max(...rows.map(row => row[key].length));
  const widths = { number: width('number'), id: width('id'), title: width('title') };
  // Numbers right-aligned, the rest left-aligned; the last column needs no padding.
  const lines = (list: typeof rows) =>
    list.length === 0
      ? null
      : [header, ...list].map(({ number, id, title, manifest }) =>
          [number.padStart(widths.number), id.padEnd(widths.id), title.padEnd(widths.title), manifest]
            .join('  ')
            .trimEnd(),
        );
  return { changes: lines(changes), kept: lines(kept) };
}

/**
 * The plan as text: its two lists, each under its title.
 * @param setup - The setup planned
 * @param plan - The plan, in order
 * @returns The text
 */
export function planText(setup: ReportedSetup, plan: readonly PlanEntry[]): string {
  const { changes, kept } = planTables(plan);
  const body =
    plan.length === 0
      ? [localize('MONDARTH-EMMA.Report.Plan.Empty')]
      : [
          localize('MONDARTH-EMMA.Report.Plan.Changes'),
          ...(changes ?? [localize('MONDARTH-EMMA.Report.Plan.NoChanges')]),
          '',
          localize('MONDARTH-EMMA.Report.Plan.Kept'),
          ...(kept ?? [localize('MONDARTH-EMMA.Report.Plan.NoneKept')]),
        ];
  return [localize('MONDARTH-EMMA.Report.Plan.Heading'), setupSummary(setup), '', ...body].join('\n');
}

/**
 * The check as text: its verdict, then every active module with its verdict and notes.
 * @param check - What the check found
 * @returns The text
 */
export function checkText(check: SetupCheck): string {
  const line = ({ title, version, badge }: SetupCheck['modules'][number]) =>
    badge === null
      ? format('MONDARTH-EMMA.Report.Check.ModuleUnjudged', { title, version })
      : format('MONDARTH-EMMA.Report.Check.Module', { title, version, verdict: badge.text });
  const noted = check.modules
    .filter(({ notes }) => notes.length > 0)
    .flatMap(reported => [line(reported), ...indented('  - ', reported.notes)]);
  // The modules checking found nothing to say of, together after the others.
  const quiet = check.modules.filter(({ notes }) => notes.length === 0).map(line);
  return [
    localize('MONDARTH-EMMA.Report.Check.Heading'),
    setupSummary(check.setup),
    '',
    localize(check.valid ? 'MONDARTH-EMMA.Report.Check.Valid' : 'MONDARTH-EMMA.Report.Check.Invalid'),
    '',
    ...noted,
    // Set apart from the modules above by two blank lines.
    ...(quiet.length === 0
      ? []
      : [
          ...(noted.length === 0 ? [] : ['', '']),
          localize('MONDARTH-EMMA.Report.Check.Nothing'),
          ...indented('- ', quiet),
        ]),
  ].join('\n');
}

/**
 * The best setup keeping the versions chosen, as text.
 * @param setup - The setup chosen
 * @param solved - The best setup, or why there is none
 * @returns The text
 */
export function updateText(setup: ReportedSetup, solved: SetupSolve): string {
  const { solution, unloaded } = solved;
  let body: string[];
  switch (solution.kind) {
    case 'found':
      body =
        solution.changes.length === 0
          ? [`${localize('MONDARTH-EMMA.Report.Solve.Found')} ${localize('MONDARTH-EMMA.Report.Solve.NoChanges')}`]
          : [
              `${localize('MONDARTH-EMMA.Report.Solve.Found')} ${localize('MONDARTH-EMMA.Report.Solve.Changes')}`,
              ...indented('  - ', solution.changes.map(changeText)),
            ];
      break;
    case 'none':
      body = [localize('MONDARTH-EMMA.Report.Solve.None'), ...indented('  ', solution.lines)];
      break;
    case 'undecided':
      body = [format('MONDARTH-EMMA.Report.Solve.Undecided', { packages: formatList(solution.needs) })];
  }
  const notes =
    unloaded.length === 0
      ? []
      : ['', format('MONDARTH-EMMA.Report.Solve.Unloaded', { packages: formatList(unloaded) })];
  return [localize('MONDARTH-EMMA.Report.Solve.Heading'), setupSummary(setup), '', ...body, ...notes].join('\n');
}

/**
 * A change the best setup makes, in words.
 * @param change - The change
 * @param change.title - The package
 * @param change.from - Its version in the setup chosen, or `null` for a package added
 * @param change.to - Its version in the best setup
 * @returns The words
 */
export function changeText({ title, from, to }: { title: string; from: string | null; to: string }): string {
  return from === null
    ? format('MONDARTH-EMMA.Report.Solve.Add', { package: title, version: to })
    : format('MONDARTH-EMMA.Report.Solve.Change', { package: title, from, to });
}
