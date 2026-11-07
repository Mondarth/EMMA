/**
 * The EMMA extension's updates: what the last search found, the versions the user has chosen, and the plan they make: those versions, with every other change they need (see `lib/plans.ts`). A version is
 * offered only if the plan can take it, and choosing it brings in what it needs. Reactive, with Svelte 5 runes, so the
 * window follows any change.
 */
import type { PackageKey, Release } from '@mondarth/fvtt-resolver';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import type { KitProblem } from '../foundry/setup-kit';
import { BusyState, afterPaint, paced } from './busy.svelte';
import { KitUnavailable } from '../foundry/setup-kit';
import { format, localize, today } from '../lib/i18n';
import type { Overview } from '../lib/overview';
import type { NotTaken, PlanEntry, Planner } from '../lib/plans';
import { UNINSTALL, keepChoices, withChoice } from '../lib/plans';
import type { Safeguard, SafeguardEdit } from '../lib/safeguards';
import { safeguardsFor } from '../lib/safeguards';
import { inUse } from '../lib/setups';
import type { UninstallEffects } from '../lib/uninstall';
import { uninstallEffects } from '../lib/uninstall';
import type { BlockedUpdate, ManifestRead, PackageUpdate, UpdateSearch, VersionOption } from '../lib/updates';

/**
 * Where the search for updates is: `unavailable` when it cannot be made, as without an EMMA module whose setup kit
 * fits (see {@link UpdateState.problem}).
 */
export type UpdateStatus = 'idle' | 'searching' | 'found' | 'failed' | 'unavailable';

/**
 * Newer versions of a package the plan does not take, one after another, for one reason: `possible` if the plan could
 * take them now, as after the choices changed.
 */
export interface NotTakenRun {
  /** The newest of them. */
  readonly newest: string;
  /** The oldest of them; the newest, if there is one. */
  readonly oldest: string;
  readonly why: NotTaken | { readonly reason: 'possible' };
}

/**
 * A version as it stands in an explanation: alone, not part of a longer version or name, as `2.1.0` in `monsterblock
 * 2.1.0 depends on _mathjs`, but not in `12.1.0` nor `2.1.0-beta`.
 * @param version - The version
 * @returns A pattern finding it
 */
export function versionIn(version: string): RegExp {
  return new RegExp(`(?<![\\w.-])${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-]|\\.\\w)`, 'g');
}

/**
 * A reason for not taking a version, as it would be for any version: the version named in its explanation stood for, so
 * that versions refused alike, each naming itself, share a line.
 * @param why - The reason
 * @param version - The version it is for
 * @returns The reason, as JSON
 */
function reasonFor(why: NotTakenRun['why'], version: string): string {
  if (why.reason !== 'conflict') return JSON.stringify(why);
  return JSON.stringify(why.explanation.map(line => line.replace(versionIn(version), '\u0000')));
}

/** A change in the plan: a version chosen, or one a version chosen needs. */
export interface UpdateChoice {
  readonly key: PackageKey;
  /** The version installed; none for a package the plan installs anew. */
  readonly installed?: string;
  readonly chosen: string;
  /** The version chosen that needs it, by its package's title; none for a version chosen. */
  readonly by?: { readonly title: string; readonly version: string };
  /** The other changes it is needed through, from that choice, by their packages' titles (see {@link PlanEntry}). */
  readonly through?: readonly { readonly title: string; readonly version: string }[];
  /** The manifest URL to install it from; none for Foundry VTT, or if none is found. */
  readonly manifest?: string;
  /** Whether the user added it against EMMA's advice, so that the plan installs it as given, without resolving it. */
  readonly forced?: true;
  /** The title of the module in the plan that recommends it, for one installed as the user wanted it with that one. */
  readonly recommendedBy?: string;
}

/** A package the user added against EMMA's advice, from a manifest they gave: installed as given, and resolved never. */
export interface ForcedInstall {
  readonly key: PackageKey;
  readonly title: string;
  readonly version: string;
  readonly manifest: string;
}

/**
 * Installing a package from a manifest the user gives: the version added, or why it could not be, with the install to
 * add against EMMA's advice when the plan cannot take it.
 */
export type ManifestResult =
  | { readonly ok: true; readonly title: string; readonly version: string }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly explanation?: readonly string[];
      readonly override?: ForcedInstall;
    };

/** Installing a package anew: the version the plan took, or why it could take none. */
export type InstallResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly reason: string; readonly explanation?: readonly string[] };

/** Uninstalling a package, as its panel offers it: what it would break, and whether the plan uninstalls it. */
export interface UninstallOffer {
  /** The version installed, which choosing takes the uninstall back. */
  readonly installed: string;
  readonly effects: UninstallEffects;
  /** Whether the plan uninstalls it. */
  readonly planned: boolean;
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
 * The newest build of Foundry VTT's generation, when the plan chose an older one: whether the plan can take it as it
 * stands (`coherent`), or only with other choices taken out (`conflict`, naming them), or not at all (`unavailable`).
 */
export type NewerCore =
  | { readonly kind: 'coherent'; readonly version: string }
  | {
      readonly kind: 'conflict';
      readonly version: string;
      readonly remove: readonly { readonly title: string; readonly version: string }[];
    }
  | { readonly kind: 'unavailable'; readonly version: string };

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

/**
 * Why a manifest the user gave could not be added, in words.
 * @param read - What reading it found
 * @returns The reason
 */
function unreadText(read: Exclude<ManifestRead, { ok: true }>): string {
  if (read.problem === 'not-manifest') return localize('Manifest.NotManifest');
  if (read.problem === 'other-type')
    return localize(read.type === 'system' ? 'Manifest.IsSystem' : 'Manifest.IsModule');
  if (read.problem === 'no-catalogue') return localize('Manifest.NoCatalogue');
  const { reason, status, host } = read;
  if (reason === 'http') return format('Manifest.Status', { host, status: String(status ?? '') });
  if (reason === 'network') return format('Manifest.Unreached', { host });
  if (reason === 'refused') return format('Manifest.Barred', { host });
  return localize(reason === 'too-large' ? 'Manifest.TooLarge' : 'Manifest.NotJson');
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
  /** Whether the choices cannot change, as while the plan runs. */
  locked = $state(false);
  /** How many times the user has changed the plan, as by choosing, taking out or clearing; a new search does not. */
  changes = $state(0);
  /** Whether the catalogue is checking the installed packages' own manifests again, as "check live" asks. */
  checking = $state(false);
  /** What EMMA is busy with, by the item the user acted on, for that item to show it. */
  readonly busy = new BusyState();

  /** The versions chosen, by package key, in the order they were chosen. */
  readonly #picks = new SvelteMap<PackageKey, string>();
  /** The titles of the packages installed anew, as Foundry's listing gives them, by package key. */
  readonly #named = new SvelteMap<PackageKey, string>();
  /** The titles of every package on Foundry's listing, once read, by package key, to name any not installed by. */
  readonly #listingTitles = new SvelteMap<PackageKey, string>();
  /** The releases read from manifests the user gave, by package key, which no search finds again. */
  readonly #manual = new SvelteMap<PackageKey, Release>();
  /** The packages added against EMMA's advice, by package key. */
  readonly #forced = new SvelteMap<PackageKey, ForcedInstall>();
  /** The modules the user wants with a module that recommends them, as `<module>><recommended>`. */
  readonly #recommending = new SvelteSet<string>();
  /** Those the user does not want, though they always want what a module recommends, as `<module>><recommended>`. */
  readonly #unwanted = new SvelteSet<string>();
  /** Why each module a module recommends could not come into the plan with it, as `<module>><recommended>`. */
  readonly #rejected = new SvelteMap<string, Exclude<InstallResult, { ok: true }>>();
  /** Whether the user wants every module a module recommends with it, but for those they untick. */
  alwaysRecommended = $state(false);
  /** The modules the plan installs as a module in it recommends them, by their keys, each with that module's. */
  readonly #recommendedBy = new SvelteMap<PackageKey, PackageKey>();
  /** What the user changed of the plan's snapshot and backups, by their keys. */
  readonly #safeguardEdits = new SvelteMap<string, SafeguardEdit>();
  /** The installation the last search was for. */
  #overview = $state.raw<Overview | null>(null);
  /** The versions last listed for a package, badged as the plan would have them, by `<key>@<version>`. */
  #listed = $state.raw<Readonly<Record<string, VersionOption>>>({});
  readonly #find: (overview: Overview) => Promise<UpdateSearch>;
  /** Counts the searches, so that only the latest one's answer is kept. */
  #searches = 0;
  /** The packages whose update the plan as it stands holds back (see {@link heldBack}). */
  readonly #heldBack = new SvelteSet<PackageKey>();
  /** The plan and search {@link checkHeldBack} last checked, and how many checks were begun. */
  #heldBackFor = '';
  #heldBackRuns = 0;
  /** The search to come of the packages the catalogue was fetching, if one is waited for. */
  #retry: ReturnType<typeof setTimeout> | undefined;

  /**
   * The changes in the plan: the versions chosen, in the order they were chosen, then what they need, then what the user
   * added against EMMA's advice, which takes the place of any change the plan makes to the same package.
   */
  readonly choices: readonly UpdateChoice[] = $derived([
    ...this.plan
      .filter(({ key }) => !this.#forced.has(key))
      .map(({ key, installed, version, by, through, manifest }) => ({
        key,
        ...(installed !== undefined && { installed }),
        chosen: version,
        ...(manifest !== undefined && { manifest }),
        ...(by !== undefined && {
          by: { title: this.titleOf(by.package), version: by.version },
        }),
        ...(through !== undefined && {
          through: through.map(step => ({ title: this.titleOf(step.package), version: step.version })),
        }),
        ...(this.#recommendedBy.has(key) && { recommendedBy: this.titleOf(this.#recommendedBy.get(key) ?? key) }),
      })),
    ...[...this.#forced.values()].map(({ key, version, manifest }) => ({
      key,
      chosen: version,
      manifest,
      forced: true as const,
    })),
  ]);

  /**
   * The plan as it is run: its changes, with what the user added against EMMA's advice in place of any change to the
   * same package, installed after the others and before the uninstalls.
   */
  readonly runPlan: readonly PlanEntry[] = $derived.by(() => {
    const kept = this.plan.filter(({ key }) => !this.#forced.has(key));
    const forced = [...this.#forced.values()].map(({ key, version, manifest }) => ({
      key,
      version,
      manifest,
      forced: true as const,
    }));
    const uninstalls = kept.filter(({ version }) => version === UNINSTALL);
    return [...kept.filter(({ version }) => version !== UNINSTALL), ...forced, ...uninstalls];
  });

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
   * no longer offers is dropped, as is an uninstall of a package no longer installed.
   *
   * Packages the catalogue does not hold yet it fetches: once it says they may be found, they are searched for once
   * more, by themselves, unless a plan is running then. A search of its own, as a refresh, cancels that one.
   * @param overview - The installation
   * @param again - Whether this is that one more search, which is never followed by another
   * @returns Once found, or failed
   */
  async searchFor(overview: Overview, again = false): Promise<void> {
    clearTimeout(this.#retry);
    this.#retry = undefined;
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
      // What the user read from manifests is known again; what they added against advice stays until it is installed.
      found.planner.include([...this.#manual.values()]);
      for (const key of [...this.#forced.keys()]) if (this.#installedOf(key) !== undefined) this.#forced.delete(key);
      // The choices are kept that the new search still offers, and planned again: an uninstall, while the package is
      // installed still, and every uninstall may still be made. A package to install anew is looked up again.
      for (const [key, version] of this.#picks) {
        if (version !== UNINSTALL && this.#installedOf(key) === undefined) await found.planner.add(key);
      }
      let picks = keepChoices(this.#picks, (key, version) =>
        version === UNINSTALL ? this.#installedOf(key) !== undefined : found.planner.candidates(key).includes(version),
      );
      if (!this.#uninstallsAllowed(overview, picks))
        picks = keepChoices(picks, (_key, version) => version !== UNINSTALL);
      const plan = picks.size === 0 ? [] : await found.planner.plan(picks);
      if (search !== this.#searches) return;
      this.#picks.clear();
      for (const [key, version] of plan === undefined ? [] : picks) this.#picks.set(key, version);
      this.plan = plan ?? [];
      // What came in on a recommendation and is no longer chosen is no longer the recommendation's.
      for (const key of [...this.#recommendedBy.keys()]) if (!this.#picks.has(key)) this.#recommendedBy.delete(key);
      const { retryAfter } = found.catalogue ?? {};
      if (!again && retryAfter !== undefined) {
        this.#retry = setTimeout(() => {
          this.#retry = undefined;
          if (!this.locked && search === this.#searches) void this.searchFor(overview, true);
        }, retryAfter * 1000);
      }
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
   * Check live: have the catalogue check the installed packages' own manifests again now, and search again, so that
   * a version published by a manifest alone since it last checked is known. A version it does not hold yet it
   * fetches, and is searched for once more when it may be found, as any package it is fetching.
   * @returns Once searched again, or at once while there is nothing to check or a check is under way
   */
  async checkLive(): Promise<void> {
    const catalogue = this.search?.catalogue;
    const overview = this.#overview;
    if (catalogue === undefined || overview === null || this.checking || this.locked) return;
    this.checking = true;
    try {
      await catalogue.recheck();
      await this.searchFor(overview);
    } finally {
      this.checking = false;
    }
  }

  /**
   * The newest version known of a package, if it is newer than one: what a package installed anew is taken at, when it
   * is not its newest.
   * @param key - The package's key
   * @param version - The version
   * @returns The newest version, or `undefined` if none is newer, or before the search has found anything
   */
  newestBeyond(key: PackageKey, version: string): string | undefined {
    return this.search?.planner.newerThan(key, version)[0];
  }

  /**
   * Why the plan takes the version of a package it does rather than a newer one: each newer version, newest first, and
   * why the plan does not take it, versions one after another for one reason sharing a line. The browser is let draw as
   * it works, as for a version list. A package whose update the plan holds back (see {@link heldBack}) is taken at its
   * installed version, so that it says what holds back each newer one. None for a package the plan does not change and
   * does not hold back, uninstalls, or takes at its newest; nor for Foundry VTT, whose builds the plan's panels say of.
   * @param key - The package's key
   * @returns The newer versions, by reason
   */
  async notTakenOf(key: PackageKey): Promise<readonly NotTakenRun[]> {
    const search = this.search;
    const chosen = this.plan.find(entry => entry.key === key)?.version ?? this.#heldBackAt(key);
    if (search === null || chosen === undefined || chosen === UNINSTALL || key === 'core') return [];
    const { planner } = search;
    const picks = new SvelteMap(this.#picks);
    const runs: NotTakenRun[] = [];
    await afterPaint();
    const pace = paced();
    for (const version of planner.newerThan(key, chosen)) {
      await pace();
      const why = (await planner.whyNotTaken(key, version, picks)) ?? { reason: 'possible' as const };
      const last = runs.at(-1);
      if (last !== undefined && reasonFor(last.why, last.newest) === reasonFor(why, version)) {
        runs[runs.length - 1] = { ...last, oldest: version };
      } else runs.push({ newest: version, oldest: version, why });
    }
    return runs;
  }

  /**
   * The version a package's update is held back at, by the plan as it stands: the installed one.
   * @param key - The package's key
   * @returns The version, or `undefined` if its update is not held back
   */
  #heldBackAt(key: PackageKey): string | undefined {
    return this.heldBack(key) ? this.updateOf(key)?.installed : undefined;
  }

  /**
   * The version the plan has of a package, as the panel says why not a newer one: the one it takes, or the installed one
   * where its update is held back (see {@link notTakenOf}).
   * @param key - The package's key
   * @returns The version, or `undefined` for none to explain
   */
  explainedAt(key: PackageKey): string | undefined {
    return this.plan.find(entry => entry.key === key)?.version ?? this.#heldBackAt(key);
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
   * Whether a package's update is held back by the plan as it stands: a newer version is offered, but the plan, with its
   * choices and locks, can take none of them, so that its version list offers nothing newer. As last checked (see
   * {@link checkHeldBack}); not, before it is checked.
   * @param key - The package's key
   * @returns `true` if it is held back
   */
  heldBack(key: PackageKey): boolean {
    return this.#heldBack.has(key);
  }

  /**
   * What {@link checkHeldBack} checks for: the search, and the versions chosen. Read where it should be checked again
   * whenever it changes.
   * @returns It, in words
   */
  get heldBackFor(): string {
    // A search still going has the number of the one it will find, so that whether it has found anything tells them apart.
    return [
      this.search === null ? 'none' : this.#searches,
      ...[...this.#picks].map(([key, version]) => `${key}@${version}`),
    ].join(' ');
  }

  /**
   * Check, for each package with an update, whether the plan as it stands can take a newer version of it (see
   * {@link heldBack}), as the plan changes. A package the plan changes already is not held back. Each tries its newer
   * versions, newest first, until the plan can take one, letting the browser draw as it goes; a check of the same plan
   * and search is not made again, and one begun is given up once another is.
   */
  async checkHeldBack(): Promise<void> {
    const search = this.search;
    const signature = this.heldBackFor;
    if (signature === this.#heldBackFor) return;
    this.#heldBackFor = signature;
    const run = ++this.#heldBackRuns;
    if (search === null) {
      this.#heldBack.clear();
      return;
    }
    const { planner } = search;
    const picks = this.#picks;
    await afterPaint();
    const pace = paced();
    for (const [key, update] of search.updates) {
      let held = this.chosenOf(key) === update.installed;
      for (const version of held ? update.versions : []) {
        if (version === update.installed || planner.missingManifest(key, version)) continue;
        await pace();
        if ((await planner.complete(withChoice(picks, key, version))).ok) {
          held = false;
          break;
        }
      }
      // Given up once another check has begun, as the plan has changed since.
      if (run !== this.#heldBackRuns) return;
      if (held) this.#heldBack.add(key);
      else this.#heldBack.delete(key);
    }
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
    const takeBack = version === this.#installedOf(key) && this.#picks.has(key);
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
    // The list that asked is drawn first, saying it is checking, and again as the work goes on, which would otherwise
    // keep the browser from drawing anything until every version was judged.
    await afterPaint();
    const pace = paced();
    for (const version of [...planner.candidates(key), installed]) {
      await pace();
      if (planner.missingManifest(key, version)) {
        const judged = search.judge(key, version, chosen);
        options.push({ ...this.#withNeeds(key, judged), missingManifest: true });
        continue;
      }
      const picks = this.#picksWith(key, version);
      const completion = await planner.complete(picks);
      if (!completion.ok) {
        const remove = await this.#inTheWay(planner, picks, key);
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
   * The choices that stand in the way of a version: each of those without which the plan could take it.
   * @param planner - The planner
   * @param picks - The versions chosen, with the version
   * @param key - The version's package
   * @returns The choices, by title, at their versions
   */
  async #inTheWay(
    planner: Planner,
    picks: ReadonlyMap<PackageKey, string>,
    key: PackageKey,
  ): Promise<{ title: string; version: string }[]> {
    const remove: { title: string; version: string }[] = [];
    for (const [other, to] of picks) {
      if (other === key) continue;
      if ((await planner.complete(withChoice(picks, other, null))).ok) {
        remove.push({ title: planner.titleOf(other), version: to });
      }
    }
    return remove;
  }

  /**
   * The newest build of Foundry VTT, of the generation of the one the plan has, when the plan has an older one. A
   * build of another generation is not offered: Foundry installs those only by hand.
   * @returns The build, and whether the plan can take it; none if the plan does not change Foundry VTT, or has its newest
   */
  async newerCore(): Promise<NewerCore | undefined> {
    const search = this.search;
    const chosen = this.plan.find(entry => entry.key === 'core')?.version;
    if (search === null || chosen === undefined) return undefined;
    const generation = (build: string) => build.split('.')[0];
    const version = search.planner.candidates('core').find(build => generation(build) === generation(chosen));
    if (version === undefined || version === chosen) return undefined;
    const picks = withChoice(this.#picks, 'core', version);
    if ((await search.planner.complete(picks)).ok) return { kind: 'coherent', version };
    const remove = await this.#inTheWay(search.planner, picks, 'core');
    return remove.length === 0 ? { kind: 'unavailable', version } : { kind: 'conflict', version, remove };
  }

  /**
   * Choose a version of a package, with whatever it needs; choosing the installed one takes the choice back.
   * @param key - The package's key
   * @param version - One of the versions {@link optionsFor} gives
   * @returns Whether the plan could take it, and so it is chosen
   */
  async choose(key: PackageKey, version: string): Promise<boolean> {
    const chosen = await this.#choose(key, version);
    // What it recommends that the user ticked comes in with it.
    if (chosen && version !== UNINSTALL) await this.#bringRecommended(key);
    return chosen;
  }

  /**
   * Restore choices kept from an earlier plan, as before Foundry VTT's update: all together, as one plan, as a new
   * search keeps the choices it still offers, so a choice that needs a later one is not refused for want of it. If they
   * cannot be planned together, each is chosen in turn instead. A package to install anew is looked up again; a choice
   * of the version installed is done already, so needs nothing.
   * @param choices - The versions chosen, as `[key, version]`, in the order they were chosen
   * @returns The keys of the choices that could not be restored
   */
  async restore(choices: readonly (readonly [PackageKey, string])[]): Promise<PackageKey[]> {
    const search = this.search;
    const overview = this.#overview;
    if (search === null || overview === null || this.locked) return choices.map(([key]) => key);
    const waiting = choices.filter(([key, version]) => this.#installedOf(key) !== version);
    for (const [key, version] of waiting) {
      if (version !== UNINSTALL && this.#installedOf(key) === undefined) await search.planner.add(key);
    }
    const offered = (key: PackageKey, version: string) =>
      version === UNINSTALL ? this.#installedOf(key) !== undefined : search.planner.candidates(key).includes(version);
    let picks = keepChoices(this.#picks, () => true);
    for (const [key, version] of waiting) if (offered(key, version)) picks = withChoice(picks, key, version);
    const plan = this.#uninstallsAllowed(overview, picks) ? await search.planner.plan(picks) : undefined;
    if (plan !== undefined && search === this.search) {
      this.#picks.clear();
      for (const [key, version] of picks) this.#picks.set(key, version);
      this.plan = plan;
      this.changes++;
      return waiting.filter(([key, version]) => !offered(key, version)).map(([key]) => key);
    }
    // Not together, or a new search began meanwhile: each in turn, as choosing it would.
    const refused: PackageKey[] = [];
    for (const [key, version] of waiting) if (!(await this.choose(key, version))) refused.push(key);
    return refused;
  }

  /**
   * Choose a version of a package, as {@link choose} does, without what it recommends.
   * @param key - The package's key
   * @param version - The version
   * @returns Whether it was chosen
   */
  async #choose(key: PackageKey, version: string): Promise<boolean> {
    if (this.locked) return false;
    const search = this.search;
    const overview = this.#overview;
    if (search === null || overview === null) return false;
    const installed = this.#installedOf(key);
    // A package not installed is chosen to install it, once its releases are known.
    if (installed === undefined && (version === UNINSTALL || !(await search.planner.add(key)))) return false;
    const offered = version === installed || version === UNINSTALL || search.planner.candidates(key).includes(version);
    if (!offered || (version === UNINSTALL && key === 'core') || search !== this.search) return false;
    const picks = this.#picksWith(key, version);
    if (!this.#uninstallsAllowed(overview, picks)) return false;
    this.planning = true;
    try {
      const plan = await search.planner.plan(picks);
      if (plan === undefined || search !== this.search) return false;
      this.#picks.clear();
      for (const [picked, to] of picks) this.#picks.set(picked, to);
      this.plan = plan;
      this.changes++;
      return true;
    } finally {
      this.planning = false;
    }
  }

  /**
   * Install a game system or module anew, at the newest version the plan can take with its other choices.
   * @param key - The package's key
   * @param title - Its title, as Foundry's listing gives it, for the plan to name it by
   * @param manifest - Its manifest URL, as Foundry's listing gives it, to find its releases by
   * @returns The version chosen, or why none could be
   */
  async install(key: PackageKey, title?: string, manifest?: string): Promise<InstallResult> {
    const search = this.search;
    if (search === null || this.locked || this.#installedOf(key) !== undefined) {
      return { ok: false, reason: localize('Install.NotNow') };
    }
    const { planner } = search;
    if (title !== undefined) this.#named.set(key, title);
    if (!(await planner.add(key, manifest))) return { ok: false, reason: localize('Install.NotFound') };
    const candidates = planner.candidates(key);
    if (candidates.length === 0) return { ok: false, reason: localize('Install.NoneRuns') };
    const installable = candidates.filter(version => !planner.missingManifest(key, version));
    if (installable.length === 0) return { ok: false, reason: localize('Install.NoManifest') };
    let explanation: readonly string[] | undefined;
    for (const version of installable) {
      const completion = await planner.complete(withChoice(this.#picks, key, version));
      if (completion.ok) {
        const chosen = await this.#choose(key, version);
        // What it recommends that the user wants comes in with it, or it does not come in at all.
        const missed = chosen ? await this.#bringRecommended(key, false) : [];
        if (!chosen || missed.length === 0) {
          return chosen ? { ok: true, version } : { ok: false, reason: localize('Install.NotNow') };
        }
        await this.takeOut(key, true);
        return {
          ok: false,
          reason: format('Recommends.Blocked', {
            modules: new Intl.ListFormat('en').format(missed.map(recommended => this.#nameOf(recommended))),
          }),
        };
      }
      explanation ??= completion.explanation;
    }
    return {
      ok: false,
      reason: localize('Install.NoVersion'),
      ...(explanation !== undefined && explanation.length > 0 && { explanation }),
    };
  }

  /**
   * Take a choice out of the plan, as one of a package to install anew, with what it brought in.
   * @param key - The package's key
   * @returns Whether it was taken out
   */
  async forget(key: PackageKey): Promise<boolean> {
    return this.takeOut(key, true);
  }

  /**
   * Whether a change in the plan can be taken out by itself: one chosen, or added against EMMA's advice, but not one
   * that only another needs.
   * @param key - The package's key
   * @returns `true` if it can
   */
  canTakeOut(key: PackageKey): boolean {
    return this.#picks.has(key) || this.#forced.has(key);
  }

  /**
   * Take a change out of the plan, as its row's button does. Alone, what it brought in stays: chosen at the versions the
   * plan has, so that the rest of the plan stands as it is, but for what another change still needs, which stays as
   * needed by it. With what it needs, that goes too, unless another change needs it still; and so it does alone, where
   * what it brought in would only bring it straight back.
   * @param key - The package's key
   * @param withNeeds - Whether what it brought in goes with it
   * @returns Whether it was taken out
   */
  async takeOut(key: PackageKey, withNeeds: boolean): Promise<boolean> {
    const taken = await this.#takeOut(key, withNeeds);
    // What came in on its recommendation goes with it.
    if (taken) {
      for (const [recommended] of [...this.#recommendedBy].filter(([, by]) => by === key)) {
        this.#recommendedBy.delete(recommended);
        await this.#takeOut(recommended, true);
      }
    }
    return taken;
  }

  /**
   * Take a change out of the plan, as {@link takeOut} does, leaving what came in on its recommendation.
   * @param key - The package's key
   * @param withNeeds - Whether what it brought in goes with it
   * @returns Whether it was taken out
   */
  async #takeOut(key: PackageKey, withNeeds: boolean): Promise<boolean> {
    if (!this.locked && this.#forced.has(key)) {
      this.#forced.delete(key);
      this.changes++;
      return true;
    }
    const search = this.search;
    const overview = this.#overview;
    if (search === null || overview === null || this.locked || !this.#picks.has(key)) return false;
    let picks = withChoice(this.#picks, key, null);
    if (!withNeeds) {
      const brought = this.#broughtIn(key);
      for (const entry of brought) picks = withChoice(picks, entry.key, entry.version);
      // What another change still needs comes in again as needed, at the same version, so it is not kept as chosen,
      // and stays locked in.
      for (const entry of brought) {
        const without = withChoice(picks, entry.key, null);
        const planned = await search.planner.plan(without);
        if (planned?.some(({ key: other, version }) => other === entry.key && version === entry.version) === true) {
          picks = without;
        }
      }
    }
    // Taking out an uninstall may break another, as of a module the plan's other uninstall needs gone.
    const allowed = this.#uninstallsAllowed(overview, picks);
    const plan = !allowed ? undefined : picks.size === 0 ? [] : await search.planner.plan(picks);
    if (plan === undefined || search !== this.search) return false;
    // A change in a ring of changes that need each other, as each brings the next in, would only come straight back:
    // it goes with what it brought in.
    if (!withNeeds && plan.some(entry => entry.key === key)) return this.#takeOut(key, true);
    this.#picks.clear();
    for (const [picked, to] of picks) this.#picks.set(picked, to);
    this.plan = plan;
    this.changes++;
    return true;
  }

  /**
   * The changes in the plan that a change brought in: those it needs, and those they need in turn.
   * @param key - The change's package
   * @returns Them
   */
  #broughtIn(key: PackageKey): PlanEntry[] {
    const found: PlanEntry[] = [];
    const isNeeder = (needer: PackageKey) => needer === key || found.some(entry => entry.key === needer);
    let grew = true;
    while (grew) {
      const more = this.plan.filter(
        entry => entry.by !== undefined && isNeeder(entry.by.package) && !found.includes(entry),
      );
      found.push(...more);
      grew = more.length > 0;
    }
    return found;
  }

  /**
   * Uninstalling a game system or module, as its panel offers it.
   * @param key - The package's key
   * @returns What it would break, and whether the plan uninstalls it; none for a package not installed, or before the
   *   search has found anything
   */
  uninstallOf(key: PackageKey): UninstallOffer | undefined {
    const overview = this.#overview;
    const installed = this.#installedOf(key);
    if (overview === null || key === 'core' || installed === undefined) return undefined;
    return {
      installed,
      effects: uninstallEffects(overview, key, this.#removing(this.#picks, key)),
      planned: this.#picks.get(key) === UNINSTALL,
    };
  }

  /**
   * The version of a package installed, whether it has an update or not.
   * @param key - The package's key
   * @returns The version; none for a package not installed
   */
  #installedOf(key: PackageKey): string | undefined {
    const update = this.updateOf(key)?.installed;
    if (update !== undefined) return update;
    const overview = this.#overview;
    const id = key.slice(key.indexOf(':') + 1);
    return key.startsWith('system:')
      ? overview?.systems.find(system => system.id === id)?.version
      : overview?.modules.find(({ module: installed }) => installed.id === id)?.module.version;
  }

  /**
   * The packages a set of choices uninstalls, but one.
   * @param picks - The versions chosen
   * @param key - The one left out
   * @returns Their keys, in the order chosen
   */
  #removing(picks: ReadonlyMap<PackageKey, string>, key: PackageKey): PackageKey[] {
    return [...picks].filter(([other, version]) => other !== key && version === UNINSTALL).map(([other]) => other);
  }

  /**
   * Whether every package a set of choices uninstalls may be uninstalled, as standard mode allows: none that would break
   * something known (see `lib/uninstall.ts`).
   * @param overview - The installation
   * @param picks - The versions chosen
   * @returns Whether they may
   */
  #uninstallsAllowed(overview: Overview, picks: ReadonlyMap<PackageKey, string>): boolean {
    return [...picks].every(
      ([key, version]) =>
        version !== UNINSTALL || uninstallEffects(overview, key, this.#removing(picks, key)).blocks.length === 0,
    );
  }

  /**
   * The versions chosen, in the order they were chosen.
   * @returns Each as `[key, version]`
   */
  get picks(): readonly (readonly [PackageKey, string])[] {
    return [...this.#picks];
  }

  /**
   * A package's title, as the installation gives it, or Foundry's listing for one to install anew.
   * @param key - The package's key, or `core`
   * @returns Its title, or its key if neither gives one
   */
  titleOf(key: PackageKey): string {
    if (key === 'core') return localize('Tree.Root');
    const title = this.#overview === null ? key : titleIn(this.#overview, key);
    return title === key ? (this.#named.get(key) ?? this.#listingTitles.get(key) ?? key) : title;
  }

  /**
   * The packages the user added against EMMA's advice.
   * @returns Them, in the order they were added
   */
  get forced(): readonly ForcedInstall[] {
    return [...this.#forced.values()];
  }

  /**
   * Install a package from a manifest the user gives: check it is a manifest of the type asked for, of a package not
   * installed nor in the plan, look up what it requires, and add it to the plan if the plan can take it. If it cannot,
   * say why, and give the install to add against EMMA's advice.
   * @param url - The manifest's URL
   * @param type - The type of package it must be
   * @returns The version added, or why it was not
   */
  async installFrom(url: string, type: 'module' | 'system'): Promise<ManifestResult> {
    const search = this.search;
    const read = search?.readManifest;
    if (search === null || read === undefined || this.locked) return { ok: false, reason: localize('Install.NotNow') };
    const found = await read(url, type);
    if (!found.ok) return { ok: false, reason: unreadText(found) };
    const { release, title } = found;
    const key = `${release.package.type}:${release.package.id}`;
    if (this.#installedOf(key) !== undefined) return { ok: false, reason: format('Manifest.Installed', { title }) };
    if (this.#picks.has(key) || this.#forced.has(key)) {
      return { ok: false, reason: format('Manifest.Planned', { title }) };
    }
    this.#named.set(key, title);
    this.#manual.set(key, release);
    const { planner } = search;
    planner.include([release]);
    for (const { package: required, manifest } of release.relationships.requires) {
      await planner.add(`${required.type}:${required.id}`, manifest);
    }
    const { version } = release;
    const completion = await planner.complete(withChoice(this.#picks, key, version));
    if (completion.ok && (await this.choose(key, version))) return { ok: true, title, version };
    const explanation = completion.ok ? undefined : completion.explanation;
    return {
      ok: false,
      reason: localize('Manifest.Refused'),
      ...(explanation !== undefined && explanation.length > 0 && { explanation }),
      override: { key, title, version, manifest: url },
    };
  }

  /**
   * Add a package to the plan against EMMA's advice: it is installed as given, and left out of what the plan resolves,
   * so that it stops nothing else being planned.
   * @param install - The install, as {@link installFrom} gave it
   * @returns Whether it was added
   */
  force(install: ForcedInstall): boolean {
    if (this.locked || this.#installedOf(install.key) !== undefined) return false;
    this.#named.set(install.key, install.title);
    this.#forced.set(install.key, install);
    this.changes++;
    return true;
  }

  /**
   * Take a package added against EMMA's advice out of the plan.
   * @param key - The package's key
   */
  unforce(key: PackageKey): void {
    if (this.locked || !this.#forced.delete(key)) return;
    this.changes++;
  }

  /**
   * Replace the plan with the best versions there are: the newest of Foundry VTT, then of each game system, then of each
   * module installed, that the plan can take with those chosen before it, as choosing each by hand would, so that every
   * recorded world keeps working. A package locked, in Foundry or, for Foundry VTT itself, in EMMA, has no other
   * version to choose, so it stays as it is. What was chosen before goes, uninstalls and packages added against advice
   * among it. It is greedy: the order is a choice, and another might find newer versions of some packages at the cost
   * of others.
   * @param options - How far it reaches
   * @param options.inUseOnly - Whether to choose versions only of the game systems and modules worlds use (see
   *   `inUse`), leaving the others as they are, though not ignored: what is used may still need one changed
   * @returns Whether the plan was replaced: not while it runs, nor before the search has found anything
   */
  async planBest(options: { readonly inUseOnly?: boolean } = {}): Promise<boolean> {
    const search = this.search;
    const overview = this.#overview;
    if (search === null || overview === null || this.locked) return false;
    const { planner } = search;
    // Limited to what the worlds use, the others are left as they are installed, unless what is used needs them changed.
    const used = options.inUseOnly === true ? inUse(overview) : undefined;
    const keys = [
      'core',
      ...overview.systems.map(({ id }) => `system:${id}`),
      ...overview.modules.map(({ module: { id } }) => `module:${id}`),
    ].filter(key => key === 'core' || used === undefined || used.has(key));
    this.planning = true;
    try {
      // The planner's answers settle at once, in a chain that would keep the browser from drawing anything, the busy
      // mark on what was clicked among it, until every package was planned.
      await afterPaint();
      const pace = paced();
      let picks: ReadonlyMap<PackageKey, string> = new SvelteMap();
      for (const key of keys) {
        for (const version of planner.candidates(key)) {
          await pace();
          if (planner.missingManifest(key, version)) continue;
          const tried = withChoice(picks, key, version);
          if ((await planner.complete(tried)).ok) {
            picks = tried;
            break;
          }
        }
      }
      const plan = picks.size === 0 ? [] : await planner.plan(picks);
      if (plan === undefined || search !== this.search) return false;
      this.#picks.clear();
      this.#forced.clear();
      this.#recommendedBy.clear();
      this.#safeguardEdits.clear();
      for (const [picked, to] of picks) this.#picks.set(picked, to);
      this.plan = plan;
      this.changes++;
      return true;
    } finally {
      this.planning = false;
    }
  }

  /**
   * The modules a module recommends: those the version in the plan does, or else the installed one.
   * @param key - The module's key
   * @returns Each with its title, whether it is installed, and whether the user wants it with the module
   */
  recommendationsOf(key: PackageKey): readonly {
    readonly key: PackageKey;
    readonly title: string;
    readonly installed: boolean;
    readonly wanted: boolean;
    /** Why it could not come into the plan with the module, if it could not. */
    readonly rejected?: Exclude<InstallResult, { ok: true }> | undefined;
  }[] {
    const planner = this.search?.planner;
    const version = this.plan.find(entry => entry.key === key)?.version ?? this.#installedOf(key);
    if (planner === undefined || version === undefined) return [];
    // By title, as the tree shows them.
    return planner
      .recommendsOf(key, version)
      .map(({ key: recommended }) => ({
        key: recommended,
        title: this.#nameOf(recommended),
        installed: this.#installedOf(recommended) !== undefined,
        // One installed is there anyway, so it is as good as wanted.
        wanted: this.#installedOf(recommended) !== undefined || this.wants(key, recommended),
        ...(this.#rejected.has(`${key}>${recommended}`) && {
          rejected: this.#rejected.get(`${key}>${recommended}`),
        }),
      }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  }

  /**
   * The modules a package requires and recommends, as the manifest the user would install it from says, for one not
   * installed, whose releases are not known until it is added.
   * @param url - The manifest's URL
   * @param type - The package's type
   * @returns The modules, by their keys, with the manifest URL a recommendation gives; none if it cannot be read
   */
  async relationsOf(
    url: string,
    type: 'module' | 'system',
  ): Promise<
    | {
        readonly requires: readonly PackageKey[];
        readonly recommends: readonly { readonly key: PackageKey; readonly manifest?: string }[];
      }
    | undefined
  > {
    const read = this.search?.readManifest;
    const found = read === undefined ? undefined : await read(url, type);
    if (found?.ok !== true) return undefined;
    const { requires, recommends } = found.release.relationships;
    const modules = <T extends { readonly package: { readonly type: string; readonly id: string } }>(
      related: readonly T[],
    ) => related.filter(({ package: ref }) => ref.type === 'module' && ref.id !== found.release.package.id);
    return {
      requires: modules(requires).map(({ package: ref }) => `module:${ref.id}`),
      recommends: modules(recommends).map(({ package: ref, manifest }) => ({
        key: `module:${ref.id}`,
        ...(manifest !== undefined && { manifest }),
      })),
    };
  }

  /**
   * A package's name: its title, or, for one not installed nor looked up yet, which has none, its ID, as the tree names
   * it.
   * @param key - Its key
   * @returns Its name
   */
  #nameOf(key: PackageKey): string {
    const title = this.titleOf(key);
    return title === key ? key.slice(key.indexOf(':') + 1) : title;
  }

  /**
   * Whether the user wants a module with one that recommends it.
   * @param key - The module's key
   * @param recommended - The recommended module's key
   * @returns `true` if they do
   */
  wants(key: PackageKey, recommended: PackageKey): boolean {
    const pair = `${key}>${recommended}`;
    return this.alwaysRecommended ? !this.#unwanted.has(pair) : this.#recommending.has(pair);
  }

  /**
   * Why a module a module recommends could not come into the plan with it.
   * @param key - The module's key
   * @param recommended - The recommended module's key
   * @returns Why, in the plan's words, if it could not
   */
  rejectionOf(key: PackageKey, recommended: PackageKey): Exclude<InstallResult, { ok: true }> | undefined {
    return this.#rejected.get(`${key}>${recommended}`);
  }

  /**
   * Whether a package is installed.
   * @param key - Its key
   * @returns `true` if it is
   */
  isInstalled(key: PackageKey): boolean {
    return this.#installedOf(key) !== undefined;
  }

  /**
   * Want a module a module recommends with it, or not. Wanted, it comes into the plan with that module, now if the
   * module is in it already, at the newest version that fits, unless it is installed; unwanted, what came in on the
   * recommendation goes.
   * @param key - The module's key
   * @param recommended - The recommended module's key
   * @param wanted - Whether it is wanted
   * @returns Once the plan is as wanted
   */
  async setRecommended(key: PackageKey, recommended: PackageKey, wanted: boolean): Promise<void> {
    if (this.locked) return;
    const pair = `${key}>${recommended}`;
    this.#rejected.delete(pair);
    if (wanted) {
      this.#recommending.add(pair);
      this.#unwanted.delete(pair);
      if (this.#picks.has(key) && this.#picks.get(key) !== UNINSTALL) await this.#bringRecommended(key);
      return;
    }
    this.#recommending.delete(pair);
    this.#unwanted.add(pair);
    if (this.#recommendedBy.get(recommended) !== key) return;
    this.#recommendedBy.delete(recommended);
    await this.#takeOut(recommended, true);
  }

  /**
   * Bring into the plan what the user wants of what a module in it recommends, and is neither installed nor planned.
   * @param key - The module's key
   * @param untick - Whether one that cannot be brought in is no longer wanted, and says why
   * @returns Those wanted that could not be brought in
   */
  async #bringRecommended(key: PackageKey, untick = true): Promise<PackageKey[]> {
    const planner = this.search?.planner;
    const version = this.#picks.get(key);
    if (planner === undefined || version === undefined) return [];
    const missed: PackageKey[] = [];
    for (const { key: recommended, manifest } of planner.recommendsOf(key, version)) {
      if (!this.wants(key, recommended)) continue;
      if (this.#installedOf(recommended) !== undefined || this.#picks.has(recommended)) continue;
      const result = await this.install(recommended, undefined, manifest);
      if (result.ok) {
        this.#recommendedBy.set(recommended, key);
        continue;
      }
      missed.push(recommended);
      // One that cannot come in is no longer wanted, saying why, but where the module is not to come in without it.
      if (!untick) continue;
      const pair = `${key}>${recommended}`;
      this.#recommending.delete(pair);
      this.#unwanted.add(pair);
      this.#rejected.set(pair, result);
    }
    return missed;
  }

  /**
   * Know the titles Foundry's listing gives, so that a package not installed is named by its title wherever it shows,
   * as one a module recommends that comes into the plan with it.
   * @param packages - The packages on the listing
   */
  knowListing(packages: readonly { readonly type: string; readonly id: string; readonly title: string }[]): void {
    for (const { type, id, title } of packages) this.#listingTitles.set(`${type}:${id}`, title);
  }

  /** Take back every choice, and what was changed of the plan's snapshot and backups. */
  clear(): void {
    if (this.locked) return;
    this.#picks.clear();
    this.#forced.clear();
    this.#recommendedBy.clear();
    this.#safeguardEdits.clear();
    this.plan = [];
    this.changes++;
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
