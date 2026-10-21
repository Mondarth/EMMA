import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import type { PackageRef, VersionJudge, VersionOption } from '@module/adapters/versions';
import { log } from '@module/lib/logger';

/** How far looking up versions has got. */
export type VersionStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Hypothetical mode's state: the versions found of the modules staged active, and the version chosen for each.
 * Choosing a version changes nothing in the world; it only changes how the versions are judged, as each is judged in
 * the setup of the modules staged active at their chosen versions.
 *
 * Versions are looked up when {@link HypotheticalState.load} is called, which EMMA does when hypothetical mode is
 * turned on and whenever another module is staged active while it is on, so nothing is fetched for a GM who never
 * uses it, and each module is looked up only once.
 */
export class HypotheticalState {
  readonly #createJudge: () => VersionJudge;
  readonly #active: () => Iterable<string>;
  #judge: VersionJudge | null = null;
  // The judge once a lookup has finished, in a new wrapper after each: the judge is not reactive, so what is read from
  // it is read again when the wrapper changes.
  #looked: { readonly judge: VersionJudge } | null = $state.raw(null);

  #status: VersionStatus = $state('idle');
  #unreached: readonly PackageRef[] = $state.raw([]);
  readonly #choices = new SvelteMap<string, string>();

  /** The modules looked up or being looked up; only read untracked. */
  readonly #asked = new SvelteSet<string>();
  #lookups = 0;
  #queue: Promise<void> = Promise.resolve();

  /** The badge each module staged active gets at its chosen version, re-judged whenever the setup changes. */
  readonly #chosen: ReadonlyMap<string, VersionOption> | undefined;

  /**
   * @param createJudge - Sets up looking up versions; called on the first {@link HypotheticalState.load}
   * @param active - The IDs of the modules staged active, read reactively
   */
  constructor(createJudge: () => VersionJudge, active: () => Iterable<string>) {
    this.#createJudge = createJudge;
    this.#active = active;
    this.#chosen = $derived(this.#looked?.judge.judgeChoices(this.#active(), this.#choices));
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
   * Look up the versions of the modules staged active that have not been looked up. Lookups run one after another.
   * Called in an effect, it runs again whenever the modules staged active change.
   * @returns Once the lookup is done; it never rejects, a failure being kept as the status
   */
  load(): Promise<void> {
    const ids = [...this.#active()];
    return untrack(() => {
      const needed = ids.filter(id => !this.#asked.has(id));
      if (this.#judge !== null && needed.length === 0) return this.#queue;
      for (const id of needed) this.#asked.add(id);
      this.#judge ??= this.#createJudge();
      const judge = this.#judge;
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
   * Whether a module has a newer version than the one installed, so there is a version to choose.
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
   * The versions of a module that may be chosen, the installed one and every newer one, each with the badge it would
   * get with the other modules at their chosen versions. Judged afresh on each call, so call it when the versions are
   * shown rather than for every module.
   * @param id - The module ID
   * @returns The versions, newest first
   */
  versionsOf(id: string): readonly VersionOption[] {
    return this.#looked?.judge.judgeVersions(this.#active(), this.#choices, id) ?? [];
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
