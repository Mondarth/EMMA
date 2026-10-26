import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import type { SetupChange, SetupReportData } from '@module/adapters/report';
import type { PackageRef, PlatformPart, VersionChoices, VersionJudge, VersionOption } from '@module/adapters/versions';
import { log } from '@module/lib/logger';

/** No module ignored, for a state told of none. */
const NONE_IGNORED: ReadonlySet<string> = new SvelteSet();

/** How far looking up versions has got. */
export type VersionStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Hypothetical mode's state: the versions found of the core, the system and the modules staged active, and the version
 * chosen for each. Choosing a version changes nothing in the world; it only changes how the versions are judged, as
 * each is judged in the setup of the core, the system and the modules staged active at their chosen versions.
 *
 * Versions are looked up when {@link HypotheticalState.load} is called, which EMMA does when hypothetical mode is
 * turned on and whenever another module is staged active while it is on, so nothing is fetched for a GM who never
 * uses it, and each module is looked up only once.
 */
export class HypotheticalState {
  readonly #createJudge: () => VersionJudge;
  readonly #active: () => Iterable<string>;
  readonly #ignored: () => ReadonlySet<string>;
  #judge: VersionJudge | null = null;
  // The judge once a lookup has finished, in a new wrapper after each: the judge is not reactive, so what is read from
  // it is read again when the wrapper changes.
  #looked: { readonly judge: VersionJudge } | null = $state.raw(null);

  #status: VersionStatus = $state('idle');
  #unreached: readonly PackageRef[] = $state.raw([]);
  readonly #choices = new SvelteMap<string, string>();
  #core: string | undefined = $state();
  #system: string | undefined = $state();
  #proxied: boolean | null = $state(null);

  /** The modules looked up or being looked up; only read untracked. */
  readonly #asked = new SvelteSet<string>();
  #lookups = 0;
  #queue: Promise<void> = Promise.resolve();

  /** The badge each module staged active gets at its chosen version, re-judged whenever the setup changes. */
  readonly #chosen: ReadonlyMap<string, VersionOption> | undefined;

  /**
   * @param createJudge - Sets up looking up versions; called on the first {@link HypotheticalState.load}
   * @param active - The IDs of the modules staged active, read reactively
   * @param ignored - The IDs of the modules hypothetical mode ignores, read reactively; none by default
   */
  constructor(
    createJudge: () => VersionJudge,
    active: () => Iterable<string>,
    ignored: () => ReadonlySet<string> = () => NONE_IGNORED,
  ) {
    this.#createJudge = createJudge;
    this.#active = active;
    this.#ignored = ignored;
    this.#chosen = $derived(this.#looked?.judge.judgeChoices(this.#active(), this.#choicesMade()));
  }

  /**
   * The versions chosen, read reactively.
   * @returns The choices
   */
  #choicesMade(): VersionChoices {
    return { core: this.#core, system: this.#system, modules: this.#choices, ignored: this.#ignored() };
  }

  /**
   * How far looking up versions has got.
   * @returns The status
   */
  get status(): VersionStatus {
    return this.#status;
  }

  /**
   * The packages whose versions could not all be looked up.
   * @returns The packages; none until a lookup is done
   */
  get unreached(): readonly PackageRef[] {
    return this.#unreached;
  }

  /**
   * Whether versions are looked up through a proxy, without which fewer are found.
   * @returns `null` until the first lookup starts
   */
  get proxied(): boolean | null {
    return this.#proxied;
  }

  /**
   * Look up the versions of the modules staged active that have not been looked up. Lookups run one after another.
   * Called in an effect, it runs again whenever the modules staged active change.
   * @returns Once the lookup is done; it never rejects, a failure being kept as the status
   */
  load(): Promise<void> {
    // An ignored module is never looked up; read here, so the effect runs again when one stops being ignored.
    const ignored = this.#ignored();
    const ids = [...this.#active()].filter(id => !ignored.has(id));
    return untrack(() => {
      const needed = ids.filter(id => !this.#asked.has(id));
      if (this.#judge !== null && needed.length === 0) return this.#queue;
      for (const id of needed) this.#asked.add(id);
      this.#judge ??= this.#createJudge();
      const judge = this.#judge;
      this.#proxied = judge.proxied;
      this.#lookups += 1;
      this.#status = 'loading';
      this.#queue = this.#queue.then(async () => {
        try {
          await judge.lookUp(needed);
          this.#unreached = judge.unreached;
          this.#looked = { judge };
          if (this.#status === 'loading') this.#status = this.#lookups === 1 ? 'ready' : 'loading';
        } catch (error: unknown) {
          log.error('Unable to look up module versions', error);
          // Asked again next time.
          for (const id of needed) this.#asked.delete(id);
          this.#status = 'failed';
        } finally {
          this.#lookups -= 1;
        }
      });
      return this.#queue;
    });
  }

  /**
   * Whether hypothetical mode ignores a module, so shows it greyed out, and never looks it up or judges it.
   * @param id - The module ID
   * @returns `true` if it is ignored
   */
  isIgnored(id: string): boolean {
    return this.#ignored().has(id);
  }

  /**
   * Whether a module has another version than the one installed, older or newer, so there is a version to choose.
   * @param id - The module ID
   * @returns `true` if it has versions to choose between
   */
  hasVersions(id: string): boolean {
    return (this.#looked?.judge.versionsOf(id).length ?? 0) > 1;
  }

  /**
   * A module's chosen version, its installed one unless another was chosen, with the badge it gets.
   * @param id - The module ID
   * @returns The version and badge, or `undefined` for a module not staged active or not yet looked up
   */
  chosen(id: string): VersionOption | undefined {
    return this.#chosen?.get(id);
  }

  /**
   * The versions of a module that may be chosen, the installed one, the two before it and every newer one, each with
   * the badge it would get with the other modules at their chosen versions. Judged afresh on each call, so call it
   * when the versions are shown rather than for every module.
   * @param id - The module ID
   * @returns The versions, newest first
   */
  versionsOf(id: string): readonly VersionOption[] {
    return this.#looked?.judge.judgeVersions(this.#active(), this.#choicesMade(), id) ?? [];
  }

  /**
   * Whether the core or the system has a newer version than the one in use, so there is a version to choose.
   * @param part - The core or the system
   * @returns `true` if it has versions to choose between
   */
  hasPlatformVersions(part: PlatformPart): boolean {
    return (this.#looked?.judge.platformVersions(part).length ?? 0) > 1;
  }

  /**
   * The version chosen of the core or the system.
   * @param part - The core or the system
   * @returns The version, or `undefined` while the one in use is kept
   */
  platformChosen(part: PlatformPart): string | undefined {
    return part === 'core' ? this.#core : this.#system;
  }

  /**
   * The versions of the core or the system that may be chosen, each with a badge for how well the setup it would make
   * fits. Judged afresh on each call, so call it when the versions are shown.
   * @param part - The core or the system
   * @returns The versions, newest first
   */
  platformVersionsOf(part: PlatformPart): readonly VersionOption[] {
    return this.#looked?.judge.judgePlatform(this.#active(), this.#choicesMade(), part) ?? [];
  }

  /**
   * Whether the setup chosen can be reported on: once versions are looked up, and not while more are.
   * @returns `true` if {@link HypotheticalState.report} has a setup to report on
   */
  get canReport(): boolean {
    return this.#looked !== null && this.#status !== 'loading';
  }

  /**
   * Report on the setup chosen: a plan and a check of it, at once, and the best setup keeping the versions chosen,
   * which may take requests to work out.
   * @returns The plan, the check and the solve, or `null` before versions are looked up
   */
  report(): SetupReportData | null {
    const judge = this.#looked?.judge;
    if (judge === undefined) return null;
    const active = [...this.#active()];
    const choices = this.#choicesMade();
    return {
      ignored: judge.reportIgnored(active, choices),
      plan: judge.reportPlan(active, choices),
      check: judge.reportCheck(active, choices),
      solve: judge.reportSolve(active, choices),
      apply: changes => {
        this.apply(changes);
        // The report on the setup the versions chosen make; there is one, as there was one to apply.
        return this.report() as SetupReportData;
      },
    };
  }

  /**
   * Choose the versions an update recommends, leaving every other choice as it is. A module the update would add is
   * given its version, which it takes if it is staged active, but is not staged: that would change the world.
   * @param changes - The changes the best setup makes
   */
  apply(changes: readonly SetupChange[]): void {
    for (const { package: changed, to } of changes) {
      if (changed.type === 'module') this.choose(changed.id, to);
      else this.choosePlatform(changed.type, to);
    }
  }

  /**
   * Whether any version has been chosen: of the core, the system or a module.
   * @returns `true` if any has
   */
  get hasChoices(): boolean {
    return this.#core !== undefined || this.#system !== undefined || this.#choices.size > 0;
  }

  /**
   * Forget every version chosen, so the core, the system and every module are judged at the versions in use again.
   */
  clearChoices(): void {
    this.#core = undefined;
    this.#system = undefined;
    this.#choices.clear();
  }

  /**
   * Choose a version of the core or the system, which re-judges every module.
   * @param part - The core or the system
   * @param version - One of its versions
   */
  choosePlatform(part: PlatformPart, version: string): void {
    if (part === 'core') this.#core = version;
    else this.#system = version;
  }

  /**
   * Choose a version of a module.
   * @param id - The module ID
   * @param version - One of its versions
   */
  choose(id: string, version: string): void {
    this.#choices.set(id, version);
  }
}
