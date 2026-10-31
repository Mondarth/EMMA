/**
 * The EMMA extension's updates: what the last search found, whether Update mode is on, and the versions the user has
 * chosen in it. Reactive, with Svelte 5 runes, so the window follows any change.
 */
import type { PackageKey } from '@mondarth/fvtt-resolver';
import { SvelteMap } from 'svelte/reactivity';

import type { Overview } from '../lib/overview';
import type { PackageUpdate, UpdateSearch } from '../lib/updates';

/** Where the search for updates is. */
export type UpdateStatus = 'idle' | 'searching' | 'found' | 'failed';

/** A version chosen that differs from the one installed. */
export interface UpdateChoice {
  readonly key: PackageKey;
  readonly installed: string;
  readonly chosen: string;
}

/** The updates, and the versions chosen. */
export class UpdateState {
  status = $state<UpdateStatus>('idle');
  /** What the last search found, once it has. */
  search = $state.raw<UpdateSearch | null>(null);
  /** Whether Update mode is on, offering the versions of each package with an update. */
  on = $state(false);

  /** The versions chosen that differ from the installed ones, by package key. */
  readonly #chosen = new SvelteMap<PackageKey, string>();
  readonly #find: (overview: Overview) => Promise<UpdateSearch>;
  /** Counts the searches, so that only the latest one's answer is kept. */
  #searches = 0;

  /** The versions chosen that differ from the installed ones, in the order they were chosen. */
  readonly choices: readonly UpdateChoice[] = $derived(
    [...this.#chosen].flatMap(([key, chosen]) => {
      const update = this.updateOf(key);
      return update === undefined ? [] : [{ key, installed: update.installed, chosen }];
    }),
  );

  /**
   * @param search - Search for the updates of an installation
   */
  constructor(search: (overview: Overview) => Promise<UpdateSearch>) {
    this.#find = search;
  }

  /**
   * Search for the updates of an installation, as it was read. A failure is kept in {@link status}, never thrown. A
   * choice the new search no longer offers is dropped.
   * @param overview - The installation
   * @returns Once found, or failed
   */
  async searchFor(overview: Overview): Promise<void> {
    const search = ++this.#searches;
    this.status = 'searching';
    try {
      const found = await this.#find(overview);
      if (search !== this.#searches) return;
      this.search = found;
      this.status = 'found';
      for (const [key, version] of this.#chosen) {
        if (found.updates.get(key)?.versions.includes(version) !== true) this.#chosen.delete(key);
      }
    } catch {
      if (search === this.#searches) this.status = 'failed';
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
   * The version chosen of a package.
   * @param key - The package's key
   * @returns The version chosen, or the installed one if none is
   */
  chosenOf(key: PackageKey): string | undefined {
    return this.#chosen.get(key) ?? this.updateOf(key)?.installed;
  }

  /**
   * Choose a version of a package; choosing the installed one takes the choice back.
   * @param key - The package's key
   * @param version - One of the versions its update offers
   */
  choose(key: PackageKey, version: string): void {
    const update = this.updateOf(key);
    if (update === undefined || !update.versions.includes(version)) return;
    if (version === update.installed) this.#chosen.delete(key);
    else this.#chosen.set(key, version);
  }

  /** Take back every choice. */
  clear(): void {
    this.#chosen.clear();
  }

  /**
   * Turn Update mode on or off. The choices are kept for when it is turned on again.
   * @param on - Whether it is on
   */
  setOn(on: boolean): void {
    this.on = on;
  }
}
