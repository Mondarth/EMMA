/**
 * Translate a localization key. Components call this rather than `game.i18n` so that they stay testable without a
 * full Foundry environment.
 * @param key - A key from `lang/en.json`
 * @returns The translated string, or the key itself if it has no translation
 */
export function localize(key: string): string {
  return game.i18n.localize(key);
}

/**
 * Translate a localization key and fill in its `{placeholders}`.
 * @param key - A key from `lang/en.json`
 * @param data - The values of its placeholders
 * @returns The translated string
 */
export function format(key: string, data: Record<string, string>): string {
  return game.i18n.format(key, data);
}

/**
 * Join items into a list in the user's language, such as "A, B and C", or "A, B or C".
 * @param items - The items
 * @param type - `conjunction` for "and", the default; `disjunction` for "or"
 * @returns The list
 */
export function formatList(items: readonly string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(game.i18n.lang, { type }).format(items);
}
