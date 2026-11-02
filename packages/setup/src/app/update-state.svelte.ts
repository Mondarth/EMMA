/**
 * The EMMA extension's updates: what the last search found, the versions the user has chosen, and the plan they make: those versions, with every other change they need (see `lib/plans.ts`). A version is
 * offered only if the plan can take it, and choosing it brings in what it needs. Reactive, with Svelte 5 runes, so the
 * window follows any change.
 */
import type { PackageKey, Release } from '@mondarth/fvtt-resolver';
import { SvelteMap } from 'svelte/reactivity';

import type { KitProblem } from '../foundry/setup-kit';
import { KitUnavailable } from '../foundry/setup-kit';
import { format, localize, today } from '../lib/i18n';
import type { Overview } from '../lib/overview';
import type { PlanEntry, Planner } from '../lib/plans';
import { UNINSTALL, keepChoices, withChoice } from '../lib/plans';
import type { Safeguard, SafeguardEdit } from '../lib/safeguards';
import { safeguardsFor } from '../lib/safeguards';
import type { UninstallEffects } from '../lib/uninstall';
import { uninstallEffects } from '../lib/uninstall';
import type { BlockedUpdate, ManifestRead, PackageUpdate, UpdateSearch, VersionOption } from '../lib/updates';

/**
 * Where the search for updates is: `unavailable` when it cannot be made, as without an EMMA module whose setup kit
 * fits (see {@link UpdateState.problem}).
 */
export type UpdateStatus = 'idle' | 'searching' | 'found' | 'failed' | 'unavailable';

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
  const { reason, status, host, proxied } = read;
  if (reason === 'http' && status === 403 && proxied) return format('Manifest.Forbidden', { host });
  if (reason === 'http') return format('Manifest.Status', { host, status: String(status ?? '') });
  if (reason === 'network') return format(proxied ? 'Manifest.Unreached' : 'Manifest.NoCors', { host });
  return localize(reason === 'budget' ? 'Manifest.Budget' : 'Manifest.NotJson');
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

  /** The versions chosen, by package key, in the order they were chosen. */
  readonly #picks = new SvelteMap<PackageKey, string>();
  /** The titles of the packages installed anew, as Foundry's listing gives them, by package key. */
  readonly #named = new SvelteMap<PackageKey, string>();
  /** The releases read from manifests the user gave, by package key, which no search finds again. */
  readonly #manual = new SvelteMap<PackageKey, Release>();
  /** The packages added against EMMA's advice, by package key. */
  readonly #forced = new SvelteMap<PackageKey, ForcedInstall>();
  /** What the user changed of the plan's snapshot and backups, by their keys. */
  readonly #safeguardEdits = new SvelteMap<string, SafeguardEdit>();
  /** The installation the last search was for. */
  #overview = $state.raw<Overview | null>(null);
  /** The versions last listed for a package, badged as the plan would have them, by `<key>@<version>`. */
  #listed = $state.raw<Readonly<Record<string, VersionOption>>>({});
  readonly #find: (overview: Overview) => Promise<UpdateSearch>;
  /** Counts the searches, so that only the latest one's answer is kept. */
  #searches = 0;

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
    const forced = [...this.#forced.values()].map(({ key, version, manifest }) => ({ key, version, manifest }));
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
    for (const version of [...planner.candidates(key), installed]) {
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
        const chosen = await this.choose(key, version);
        return chosen ? { ok: true, version } : { ok: false, reason: localize('Install.NotNow') };
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
    if (!this.locked && this.#forced.has(key)) {
      this.#forced.delete(key);
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
    if (!withNeeds && plan.some(entry => entry.key === key)) return this.takeOut(key, true);
    this.#picks.clear();
    for (const [picked, to] of picks) this.#picks.set(picked, to);
    this.plan = plan;
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
    return title === key ? (this.#named.get(key) ?? key) : title;
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
    return true;
  }

  /**
   * Take a package added against EMMA's advice out of the plan.
   * @param key - The package's key
   */
  unforce(key: PackageKey): void {
    if (!this.locked) this.#forced.delete(key);
  }

  /** Take back every choice, and what was changed of the plan's snapshot and backups. */
  clear(): void {
    if (this.locked) return;
    this.#picks.clear();
    this.#forced.clear();
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
