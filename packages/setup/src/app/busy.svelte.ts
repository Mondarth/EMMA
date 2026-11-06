/**
 * What EMMA is busy with because of something the user did, by the item they did it on: while it works, that item is
 * overlaid with a spinner and a word for what is happening (see `component/BusyMark.svelte`), so that a pause does not
 * look like nothing happening. Reactive, with Svelte 5 runes.
 */
import { SvelteMap } from 'svelte/reactivity';

/** What EMMA may be busy with, each said in one word. */
export type Activity = 'planning' | 'reading' | 'checking' | 'refreshing' | 'locking' | 'ignoring' | 'resuming';

/** What EMMA is busy with, by the item that set it to work. */
export class BusyState {
  /** Each item's activity, and how many runs of it are under way, so that the last to finish clears it. */
  readonly #items = new SvelteMap<string, { readonly activity: Activity; readonly runs: number }>();

  /**
   * What EMMA is busy with for an item, if anything.
   * @param item - The item, such as `tree:<row key>`
   * @returns The activity, or `undefined` while EMMA is not busy with it
   */
  activityOf(item: string): Activity | undefined {
    return this.#items.get(item)?.activity;
  }

  /**
   * Do some work for an item, marking it busy until the work is done, or has failed.
   * @param item - The item the user acted on
   * @param activity - What the work is
   * @param work - The work
   * @returns What the work gives
   */
  async run<T>(item: string, activity: Activity, work: () => Promise<T>): Promise<T> {
    const held = this.#items.get(item);
    this.#items.set(item, { activity, runs: (held?.runs ?? 0) + 1 });
    try {
      return await work();
    } finally {
      const now = this.#items.get(item);
      if (now === undefined || now.runs <= 1) this.#items.delete(item);
      else this.#items.set(item, { ...now, runs: now.runs - 1 });
    }
  }
}
