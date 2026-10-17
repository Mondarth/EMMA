/**
 * Translate a localization key. Components call this rather than `game.i18n` so that they stay testable without a
 * full Foundry environment.
 * @param key - A key from `lang/en.json`
 * @returns The translated string, or the key itself if it has no translation
 */
export function localize(key: string): string {
  return game.i18n.localize(key);
}
