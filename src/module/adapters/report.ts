/**
 * Reports on a setup for hypothetical mode: a check of the setup chosen, and the best setup that keeps the versions
 * chosen, both in words. The resolver works them out; this words them with {@link explanationMessages}, so the report
 * reads in the user's language.
 */
import type {
  Advisory,
  CheckOptions,
  Policy,
  ExplanationMessages,
  PackageKey,
  PackageVersion,
  Preference,
  Release,
  ReleaseCheck,
  Requirements,
  SetupSpec,
  Universe,
} from '@mondarth/fvtt-resolver';
import {
  CORE,
  check,
  describeReason,
  explain,
  packageKey,
  resolveInRounds,
  sameVersion,
} from '@mondarth/fvtt-resolver';

import { format, localize } from '@module/lib/i18n';

import type { VersionBadge } from './modules';

/** An active module of the setup, with everything the check found about it. */
export interface ReportedPackage {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  /** The badge Foundry gives it in the setup, or `null` if it gives none. */
  readonly badge: VersionBadge | null;
  /**
   * Sentences on what keeps it from being used, what it prefers and is not given, and what it advises (a module it
   * recommends that is not active, or one it conflicts with that is); and whether it was not known, or known only from
   * a listing.
   */
  readonly notes: readonly string[];
}

/** An active module in a plan: what to install, and where from. */
export interface PlanEntry {
  readonly id: string;
  readonly title: string;
  /** Whether it changes what is installed: a version other than the one installed, or a module not installed. */
  readonly changes: boolean;
  /**
   * A manifest URL for the version chosen alone, which installs that version however many are released after it;
   * `null` when no source gives one. Never the manifest URL a release gives for the newest version.
   */
  readonly manifest: string | null;
}

/** What checking the setup chosen found. */
export interface SetupCheck {
  /** The setup checked: its core version, its system named with its version, and how many modules it has. */
  readonly setup: { readonly core: string; readonly system: string; readonly modules: number };
  /** Whether every package is known and none breaks a rule of another. */
  readonly valid: boolean;
  /** Every active module of the setup, by title, at the version chosen, as hypothetical mode shows them. */
  readonly modules: readonly ReportedPackage[];
}

/** A package the best setup changes. */
export interface SetupChange {
  /** The package: Foundry itself, the system, or a module, by ID. */
  readonly package: ChangedPackage;
  readonly title: string;
  /** The version in the setup chosen; `null` for a package the setup does not have. */
  readonly from: string | null;
  readonly to: string;
}

/** A package a change is to: Foundry itself (`core`), the system, or a module, by ID. */
export interface ChangedPackage {
  readonly type: 'core' | 'system' | 'module';
  readonly id: string;
}

/** An active module that cannot be had, which every report leaves out, and why. */
export interface UnavailableModule {
  readonly title: string;
  /** `archived`: Foundry VTT's listing of it is archived, so it is no longer offered. `gone`: its files are gone. */
  readonly reason: 'archived' | 'gone';
  /** More of why, in words, as the catalogue's maintainers wrote it. */
  readonly note?: string;
}

/**
 * A report on a hypothetical setup: its plan and check, and its best versions, worked out when first asked for.
 * Choosing the versions the update recommends gives the report on the setup they make.
 */
export interface SetupReportData {
  /** The titles of the active modules hypothetical mode ignores, which every report leaves out and warns of. */
  readonly ignored: readonly string[];
  /** The active modules that cannot be had, which every report leaves out and names, with why. */
  readonly unavailable: readonly UnavailableModule[];
  readonly plan: readonly PlanEntry[];
  readonly check: SetupCheck;
  /**
   * Work out the best versions, which may take requests; only the update needs them.
   * @returns The same solve each time it is called
   */
  readonly solve: () => Promise<SetupSolve>;
  /**
   * Choose the versions an update recommends in the hypothetical setup reported on.
   * @returns The report on the setup they make
   */
  readonly apply: (changes: readonly SetupChange[]) => SetupReportData;
}

/** The best versions of the active modules, or why there are none. */
export type SetupSolution =
  | { readonly kind: 'found'; readonly changes: readonly SetupChange[] }
  /** No setup: the explanation, one sentence to a line. */
  | { readonly kind: 'none'; readonly lines: readonly string[] }
  /** No answer without the manifests of these releases, which could not be loaded. */
  | { readonly kind: 'undecided'; readonly needs: readonly string[] };

/** The best setup, and the releases whose manifests could not be loaded on the way. */
export interface SetupSolve {
  readonly solution: SetupSolution;
  /** Releases judged from their listings, as their manifests could not be loaded. */
  readonly unloaded: readonly string[];
}

/** A setup to report on, always with its modules. */
export type ReportedSetup = SetupSpec & { readonly modules: readonly PackageVersion[] };

/**
 * The version of each package in a setup, keyed by package key.
 * @param setup - The setup
 * @returns The versions
 */
function versionsIn(setup: ReportedSetup): Map<PackageKey, string> {
  return new Map([
    [CORE, setup.core],
    [setup.system.package, setup.system.version],
    ...setup.modules.map(({ package: key, version }) => [key, version] as const),
  ]);
}

/**
 * Check a setup, with a note in words for every rule a package breaks, every preference it misses and every advisory
 * that applies.
 * @param universe - The releases known
 * @param setup - The setup
 * @param messages - The wording
 * @param badgeOf - The badge Foundry gives a release, with what checking found of every package in the setup
 * @param options - How to check; the resolver's default policy unless given
 * @returns What the check found
 */
export function checkReport(
  universe: Universe,
  setup: ReportedSetup,
  messages: ExplanationMessages,
  badgeOf: (checked: ReleaseCheck, all: readonly ReleaseCheck[]) => VersionBadge | null,
  options: CheckOptions = {},
): SetupCheck {
  const result = check(universe, setup, options);
  const versions = versionsIn(setup);
  const named = (key: PackageKey, version: string) => messages.term(messages.name(key), messages.exactly(version));
  // A preference is missed, and a conflict advised of, only for a package in the setup, so its version is known.
  const at = (key: PackageKey) => named(key, versions.get(key) as string);
  // The resolver words the rules a release declares; preferences and advisories it leaves to the caller.
  const missed = (release: string, { on }: Preference) =>
    format('MONDARTH-EMMA.Report.Check.Missed', { release, package: at(on) });
  const advised = (release: string, { reason, on }: Advisory) =>
    reason === 'recommends'
      ? format('MONDARTH-EMMA.Report.Check.Recommends', { release, package: messages.name(on) })
      : format('MONDARTH-EMMA.Report.Check.Conflicts', { release, package: at(on) });

  const isIn = (list: readonly PackageVersion[], key: PackageKey) => list.some(spec => spec.package === key);
  const modules = setup.modules.map(({ package: key, version }): ReportedPackage => {
    const id = key.slice(key.indexOf(':') + 1);
    const title = messages.name(key);
    const checked = result.releases.find(({ release }) => packageKey(release.package) === key);
    if (checked === undefined)
      return { id, title, version, badge: null, notes: [localize('MONDARTH-EMMA.Report.Check.Unknown')] };
    const name = named(key, version);
    return {
      id,
      title,
      version,
      badge: badgeOf(checked, result.releases),
      notes: [
        ...checked.broken.map(constraint =>
          messages.sentence(describeReason({ kind: 'constraint', constraint }, messages)),
        ),
        ...checked.missed.map(preference => missed(name, preference)),
        ...checked.advisories.map(advisory => advised(name, advisory)),
        ...(isIn(result.listed, key) ? [localize('MONDARTH-EMMA.Report.Check.Listed')] : []),
      ],
    };
  });
  return {
    setup: {
      core: setup.core,
      system: named(setup.system.package, setup.system.version),
      modules: setup.modules.length,
    },
    valid: result.valid,
    modules: modules.sort((a, b) => a.title.localeCompare(b.title, game.i18n.lang)),
  };
}

/**
 * Plan the active modules of a setup: each at the version chosen, with its manifest URL, in the order to install them.
 * A module comes before the modules that depend on it: they are ordered by how deep the tree of active modules that
 * depend on each one goes, deepest first, then by ID.
 * @param universe - The releases known
 * @param setup - The setup
 * @param messages - The wording, for the modules' titles
 * @param installed - The version installed of each installed module, keyed by module ID
 * @returns The plan, in order
 */
export function planReport(
  universe: Universe,
  setup: ReportedSetup,
  messages: ExplanationMessages,
  installed: ReadonlyMap<string, string>,
): PlanEntry[] {
  const releases = new Map(
    setup.modules.map(({ package: key, version }) => [
      key,
      universe.releases.find(release => packageKey(release.package) === key && sameVersion(release.version, version)),
    ]),
  );
  /**
   * The active modules a module's release requires.
   * @param key - The module
   * @returns Their keys
   */
  const requires = (key: PackageKey): PackageKey[] =>
    (releases.get(key)?.relationships.requires ?? [])
      .filter(({ package: required }) => required.type === 'module')
      .map(({ package: required }) => packageKey(required))
      .filter(required => releases.has(required));
  const dependants = new Map<PackageKey, PackageKey[]>();
  for (const key of releases.keys())
    for (const required of requires(key)) dependants.set(required, [...(dependants.get(required) ?? []), key]);

  const depths = new Map<PackageKey, number>();
  /**
   * How deep the tree of modules depending on a module goes. A cycle of dependencies, which Foundry would not load
   * anyway, ends where it comes back round.
   * @param key - The module
   * @param path - The modules followed to reach it
   * @returns 0 for a module nothing depends on
   */
  const depth = (key: PackageKey, path: ReadonlySet<PackageKey> = new Set()): number => {
    const known = depths.get(key);
    if (known !== undefined) return known;
    const next = new Set([...path, key]);
    const following = (dependants.get(key) ?? []).filter(dependant => !next.has(dependant));
    const found = Math.max(0, ...following.map(dependant => depth(dependant, next) + 1));
    depths.set(key, found);
    return found;
  };

  const chosen = new Map(setup.modules.map(({ package: key, version }) => [key, version]));
  return [...releases]
    .map(([key, release]) => {
      const id = key.slice(key.indexOf(':') + 1);
      const now = installed.get(id);
      const version = chosen.get(key) as string;
      return {
        id,
        title: messages.name(key),
        changes: now === undefined || !sameVersion(now, version),
        manifest: release?.versionManifest ?? null,
        depth: depth(key),
      };
    })
    .sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id))
    .map(({ id, title, changes, manifest }) => ({ id, title, changes, manifest }));
}

/**
 * How the best versions are found. A version not verified for the core is a compatibility risk, which is acceptable,
 * so it counts the same as a verified one (with the core kept, the resolver's default already does so; this keeps it
 * so); a version outside the range of systems it declares is not compatible with
 * the system; and one that declares no compatibility at all, which Foundry cannot place, is not chosen.
 */
const BEST_VERSIONS_POLICY: Partial<Policy> = {
  verified: 'ignore',
  systemCompatibility: 'require',
  missingCompatibility: 'reject',
};

/**
 * Find the best versions of the setup's modules: the newest of each that works with the others and with the core and
 * system of the setup, which are kept. The versions chosen of the modules only set how far back it may go, as the
 * universe given holds nothing older than two versions before them; among the rest, only the best is sought.
 * @param universe - The releases known, from two versions before the one chosen of each package up
 * @param setup - The setup chosen
 * @param messages - The wording
 * @param load - Loads releases known only from a listing, as the answer needs them
 * @param kept - Modules to keep at their versions, as the core and system are: those taken as present, whose version
 *   is the one release standing for them, which the update would otherwise leave out if it looked like a pre-release
 * @returns The best versions, as changes to the setup, or why there are none
 */
export async function solveReport(
  universe: Universe,
  setup: ReportedSetup,
  messages: ExplanationMessages,
  load: (needs: readonly Release[]) => Promise<readonly Release[]>,
  kept: readonly PackageVersion[] = [],
): Promise<SetupSolve> {
  const versions = versionsIn(setup);
  const requirements: Requirements = {
    require: setup.modules.map(({ package: key }) => ({ package: key })),
    pins: [{ package: CORE, version: setup.core }, setup.system, ...kept],
  };
  const rounds = await resolveInRounds(universe, requirements, load, { policy: BEST_VERSIONS_POLICY });
  const { resolution } = rounds;
  // Those `load` left out, and those it returned marked as failed, as the resolver's own sources do.
  const failed = rounds.universe.releases
    .filter(release => release.loadFailed === true)
    .map(release => ({ package: packageKey(release.package), version: release.version }));
  const unloaded = [...rounds.unloaded, ...failed].filter(
    (spec, index, specs) =>
      specs.findIndex(other => other.package === spec.package && sameVersion(other.version, spec.version)) === index,
  );
  const names = (list: readonly PackageVersion[]) =>
    list.map(({ package: key, version }) => messages.term(messages.name(key), messages.exactly(version)));

  let solution: SetupSolution;
  if (resolution.ok) {
    // The core and system are kept, so only modules change.
    solution = {
      kind: 'found',
      changes: resolution.setup.modules.flatMap(({ package: { id }, version }) => {
        const key = packageKey({ type: 'module', id });
        const from = versions.get(key) ?? null;
        return from !== null && sameVersion(from, version)
          ? []
          : [{ package: { type: 'module' as const, id }, title: messages.name(key), from, to: version }];
      }),
    };
  } else if ('failure' in resolution) {
    solution = {
      kind: 'none',
      lines: explain(resolution.failure, messages).map(({ text, number }) =>
        number === undefined ? text : messages.see(text, number),
      ),
    };
  } else {
    solution = { kind: 'undecided', needs: names(resolution.needs) };
  }
  return { solution, unloaded: names(unloaded) };
}
