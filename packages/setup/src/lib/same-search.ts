/**
 * The last search, given again for the same installation and releases. A search builds its planner afresh, and the
 * planner learns as it goes: each set of choices it completes is kept for when it is asked again, as version lists open
 * and close. "Check live" and a retry for pending packages search again, and most often find just what the last search
 * found; with a new planner, every version list solved its versions afresh, for seconds on a large installation. Given
 * again, the search keeps what its planner learned.
 */

/** What a search starts from: the installation and the releases found, as one value each. */
export interface SearchInputs {
  readonly overview: unknown;
  readonly universe: unknown;
}

/**
 * Searches, giving the last search again in place of a new one from the same inputs, with the same setup kit.
 * @returns A function that searches, given the setup kit (the same object for the same kit), the inputs and the search
 */
export function searchesOnce<S>(): (kit: object, inputs: SearchInputs, search: () => Promise<S>) => Promise<S> {
  let last: { kit: object; signature: string; found: S } | undefined;
  return async (kit, inputs, search) => {
    // The inputs are the catalogue's answers and the installation as read, so equal JSON is equal inputs.
    const signature = JSON.stringify([inputs.overview, inputs.universe]);
    if (last !== undefined && last.kit === kit && last.signature === signature) return last.found;
    last = undefined;
    const found = await search();
    last = { kit, signature, found };
    return found;
  };
}
