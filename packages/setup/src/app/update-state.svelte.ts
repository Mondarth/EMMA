/**
 * The EMMA extension's updates: what the last search found, the versions the user has chosen, and the plan they make: those versions, with every other change they need (see `lib/plans.ts`). A version is
 * offered only if the plan can take it, and choosing it brings in what it needs. Reactive, with Svelte 5 runes, so the
 * window follows any change.
 */
import type { PackageKey } from '@mondarth/fvtt-resolver';
import { SvelteMap } from 'svelte/reactivity';

import type { KitProblem } from '../foundry/setup-kit';
import { KitUnavailable } from '../foundry/setup-kit';
import { format, today } from '../lib/i18n';
import type { Overview } from '../lib/overview';
import type { PlanEntry } from '../lib/plans';
import { keepChoices, withChoice } from '../lib/plans';
import type { Safeguard, SafeguardEdit } from '../lib/safeguards';
import { safeguardsFor } from '../lib/safeguards';
import type { BlockedUpdate, PackageUpdate, UpdateSearch, VersionOption } from '../lib/updates';

/**
 * Where the search for updates is: `unavailable` when it cannot be made, as without an EMMA module whose setup kit
 * fits (see {@link UpdateState.problem}).
 */
export type UpdateStatus = 'idle' | 'searching' | 'found' | 'failed' | 'unavailable';

/** A change in the plan: a version chosen, or one a version chosen needs. */
export interface UpdateChoice {
  readonly key: PackageKey;
  readonly installed: string;
  readonly chosen: string;
  /** The version chosen that needs it, by its package's title; none for a version chosen. */
  readonly by?: { readonly title: string; readonly version: string };
  /** The manifest URL to install it from; none for Foundry VTT, or if none is found. */
  readonly manifest?: string;
}

/** A version a package's panel explains: one the user is looking at in its list, or else the one chosen. */
export interface ExplainedVersion {
  readonly option: VersionOption;
  /** The version installed. */
  readonly installed: string;
  /** Whether it is the one looked at in the list, rather than the one chosen. */
  readonly previewing: boolean;
}

/**
 * An installed system's or module's title, as the installation gives it.
 * @param overview - The installation
 * @param key - The package's key
 * @returns Its title, or its key if it is not installed
 */
function titleIn(overview: Overview, key: PackageKey): string {
  const id = key.slice(key.indexOf(':') + 1);
  const installed = key.startsWith('system:')
    ? overview.systems.find(system => system.id === id)
    : overview.modules.find(use => use.module.id === id)?.module;
  return installed?.title ?? key;
}

/** The updates, and the versions chosen. */
export class UpdateState {
  status = $state<UpdateStatus>('idle');
  /** What the last search found, once it has. */
  search = $state.raw<UpdateSearch | null>(null);
  /** Why the search cannot be made, while the status is `unavailable`. */
  problem = $state.raw<KitProblem | null>(null);
  /** The version the user is looking at in a package's list, while it is open. */
  preview = $state.raw<{ readonly key: PackageKey; readonly version: string } | null>(null);
  /** The plan: the versions chosen, and what they need. */
  plan = $state.raw<readonly PlanEntry[]>([]);
  /** Whether a choice is being planned. */
  planning = $state(false);

  /** The versions chosen, by package key, in the order they were chosen. */
  readonly #picks = new SvelteMap<PackageKey, string>();
  /** What the user changed of the plan's snapshot and backups, by their keys. */
  readonly #safeguardEdits = new SvelteMap<string, SafeguardEdit>();
  /** The installation the last search was for. */
  #overview = $state.raw<Overview | null>(null);
  /** The versions last listed for a package, badged as the plan would have them, by `<key>@<version>`. */
  #listed = $state.raw<Readonly<Record<string, VersionOption>>>({});
  readonly #find: (overview: Overview) => Promise<UpdateSearch>;
  /** Counts the searches, so that only the latest one's answer is kept. */
  #searches = 0;

  /** The changes in the plan: the versions chosen, in the order they were chosen, then what they need. */
  readonly choices: readonly UpdateChoice[] = $derived(
    this.plan.map(({ key, installed, version, by, manifest }) => ({
      key,
      installed,
      chosen: version,
      ...(manifest !== undefined && { manifest }),
      ...(by !== undefined && {
        by: { title: this.search?.planner.titleOf(by.package) ?? by.package, version: by.version },
      }),
    })),
  );

  /**
   * What the plan offers to keep before it changes anything: a snapshot, checked when Foundry VTT changes, then a
   * backup of each world that uses a package the plan changes (see `lib/safeguards.ts`). None while nothing is chosen.
   */
  readonly safeguards: readonly Safeguard[] = $derived.by(() => {
    const overview = this.#overview;
    if (overview === null) return [];
    return safeguardsFor(
      overview,
      this.plan,
      this.#safeguardEdits,
      {
        snapshot: format('Plan.SnapshotNote', { date: today() }),
        backup: packages => format('Plan.BackupNote', { packages: packages.join(', ') }),
      },
      key => titleIn(overview, key),
    );
  });

  /**
   * @param search - Search for the updates of an installation
   */
  constructor(search: (overview: Overview) => Promise<UpdateSearch>) {
    this.#find = search;
  }

  /**
   * Search for the updates of an installation, as it was read. A failure is kept in {@link status}, never thrown, and
   * a search that cannot be made in {@link problem} too, with what was found before dropped. A choice the new search
   * no longer offers is dropped.
   * @param overview - The installation
   * @returns Once found, or failed
   */
  async searchFor(overview: Overview): Promise<void> {
    const search = ++this.#searches;
    this.#overview = overview;
    this.status = 'searching';
    try {
      const found = await this.#find(overview);
      if (search !== this.#searches) return;
      this.search = found;
      this.problem = null;
      this.status = 'found';
      this.#listed = {};
      // The choices are kept that the new search still offers, and planned again.
      const picks = keepChoices(this.#picks, (key, version) => found.planner.candidates(key).includes(version));
      const plan = picks.size === 0 ? [] : await found.planner.plan(picks);
      if (search !== this.#searches) return;
      this.#picks.clear();
      for (const [key, version] of plan === undefined ? [] : picks) this.#picks.set(key, version);
      this.plan = plan ?? [];
    } catch (error) {
      if (search !== this.#searches) return;
      if (error instanceof KitUnavailable) {
        this.search = null;
        this.problem = error.problem;
        this.#picks.clear();
        this.plan = [];
        this.status = 'unavailable';
      } else {
        this.status = 'failed';
      }
    }
  }

  /**
   * The update on offer for a package.
   * @param key - The package's key, such as `module:<id>`
   * @returns The update, or `undefined` if there is none
   */
  updateOf(key: PackageKey): PackageUpdate | undefined {
    return this.search?.updates.get(key);
  }

  /**
   * The newer version of a package that EMMA cannot offer, and why.
   * @param key - The package's key
   * @returns The blocked update, or `undefined` if there is none
   */
  blockedOf(key: PackageKey): BlockedUpdate | undefined {
    return this.search?.blocked.get(key);
  }

  /**
   * The version of a package in the plan.
   * @param key - The package's key
   * @returns The version chosen, or needed, or else the installed one if it has an update
   */
  chosenOf(key: PackageKey): string | undefined {
    return this.plan.find(entry => entry.key === key)?.version ?? this.updateOf(key)?.installed;
  }

  /**
   * A version of a package, badged as the EMMA module badges it, with the other packages at the versions chosen.
   * @param key - The package's key
   * @param version - The version
   * @returns The version, with its badge; none before the search has found anything
   */
  optionOf(key: PackageKey, version: string): VersionOption {
    const search = this.search;
    if (search === null) return { version, badge: null };
    return this.#withNeeds(
      key,
      search.judge(key, version, other => this.chosenOf(other)),
    );
  }

  /**
   * A version, with what it needs, as its manifest declares it.
   * @param key - The package's key
   * @param option - The version, badged
   * @returns The version, with what it needs if anything
   */
  #withNeeds(key: PackageKey, option: VersionOption): VersionOption {
    const needs = this.search?.planner.needsOf(key, option.version) ?? [];
    return needs.length === 0 ? option : { ...option, needs };
  }

  /**
   * Say which version the user is looking at in a package's list.
   * @param key - The package's key
   * @param version - The version, or `null` once the list closes
   */
  setPreview(key: PackageKey, version: string | null): void {
    if (version !== null) this.preview = { key, version };
    else if (this.preview?.key === key) this.preview = null;
  }

  /**
   * The version a package's panel explains: the one looked at in its list, or else the one chosen, if not installed.
   * @param key - The package's key
   * @returns The version, badged; `undefined` for none
   */
  explainedOf(key: PackageKey): ExplainedVersion | undefined {
    const update = this.updateOf(key);
    if (update === undefined) return undefined;
    const { installed } = update;
    if (this.preview?.key === key) {
      const { version } = this.preview;
      const option = this.#listed[`${key}@${version}`] ?? this.optionOf(key, version);
      return { option, installed, previewing: true };
    }
    const chosen = this.plan.find(entry => entry.key === key)?.version;
    return chosen === undefined ? undefined : { option: this.optionOf(key, chosen), installed, previewing: false };
  }

  /**
   * The versions chosen, with one package at a version: choosing a package's installed version takes back the choice
   * of it, and is kept as a choice only of a package that the plan needs otherwise.
   * @param key - The package's key
   * @param version - The version
   * @returns The versions chosen
   */
  #picksWith(key: PackageKey, version: string): ReadonlyMap<PackageKey, string> {
    const takeBack = version === this.updateOf(key)?.installed && this.#picks.has(key);
    return withChoice(this.#picks, key, takeBack ? null : version);
  }

  /**
   * The versions of a package that may be chosen, with what is chosen already: those the plan can take, each badged as
   * the plan would have it, saying what else it would change. The installed one is among them if the plan can go
   * without it. A version the plan cannot take only because of other choices in it is among them too, but cannot be
   * chosen until those are taken out (see {@link VersionOption.conflict}); one no change to the plan would let in is not.
   * A version found with no manifest URL of its own is among them, but cannot be chosen at all (see
   * {@link VersionOption.missingManifest}).
   * @param key - The package's key
   * @returns The versions, newest first
   */
  async optionsFor(key: PackageKey): Promise<readonly VersionOption[]> {
    const search = this.search;
    const installed = this.updateOf(key)?.installed;
    if (search === null || installed === undefined) return [];
    const { planner } = search;
    const chosen = (other: PackageKey) => this.chosenOf(other);
    const options: VersionOption[] = [];
    for (const version of [...planner.candidates(key), installed]) {
      if (planner.missingManifest(key, version)) {
        const judged = search.judge(key, version, chosen);
        options.push({ ...this.#withNeeds(key, judged), missingManifest: true });
        continue;
      }
      const picks = this.#picksWith(key, version);
      const completion = await planner.complete(picks);
      if (!completion.ok) {
        // The choices that stand in its way: each of those without which it could be had.
        const remove: { title: string; version: string }[] = [];
        for (const [other, to] of picks) {
          if (other === key) continue;
          if ((await planner.complete(withChoice(picks, other, null))).ok) {
            remove.push({ title: planner.titleOf(other), version: to });
          }
        }
        if (remove.length === 0) continue;
        const locked = this.#withNeeds(key, search.judge(key, version, chosen));
        options.push({ ...locked, conflict: { remove, explanation: completion.explanation ?? [] } });
        continue;
      }
      const option = this.#withNeeds(
        key,
        search.judge(key, version, other => completion.versions.get(other)),
      );
      const brings = [...completion.versions]
        .filter(([other, to]) => other !== key && this.chosenOf(other) !== to)
        .map(([other, to]) => ({ title: planner.titleOf(other), version: to }));
      options.push(brings.length === 0 ? option : { ...option, brings });
    }
    if (search === this.search) {
      this.#listed = Object.fromEntries(options.map(option => [`${key}@${option.version}`, option]));
    }
    return options;
  }

  /**
   * Choose a version of a package, with whatever it needs; choosing the installed one takes the choice back.
   * @param key - The package's key
   * @param version - One of the versions {@link optionsFor} gives
   * @returns Whether the plan could take it, and so it is chosen
   */
  async choose(key: PackageKey, version: string): Promise<boolean> {
    const search = this.search;
    const installed = this.updateOf(key)?.installed;
    if (search === null || installed === undefined) return false;
    if (version !== installed && !search.planner.candidates(key).includes(version)) return false;
    const picks = this.#picksWith(key, version);
    this.planning = true;
    try {
      const plan = await search.planner.plan(picks);
      if (plan === undefined || search !== this.search) return false;
      this.#picks.clear();
      for (const [picked, to] of picks) this.#picks.set(picked, to);
      this.plan = plan;
      return true;
    } finally {
      this.planning = false;
    }
  }

  /** Take back every choice, and what was changed of the plan's snapshot and backups. */
  clear(): void {
    this.#picks.clear();
    this.#safeguardEdits.clear();
    this.plan = [];
  }

  /**
   * Check or uncheck one of the plan's snapshot and backups, or change its note. What is changed stays while the plan
   * offers it.
   * @param key - Its key (see {@link Safeguard.key})
   * @param edit - What changes
   */
  setSafeguard(key: string, edit: SafeguardEdit): void {
    this.#safeguardEdits.set(key, { ...this.#safeguardEdits.get(key), ...edit });
  }
}
