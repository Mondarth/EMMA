/**
 * The extension's text, from `public/_locales/<language>/messages.json`, in the browser's language.
 */

/**
 * Translate a message.
 * @param key - The message's name in `messages.json`
 * @param substitutions - The values of its `$1`, `$2`… placeholders
 * @returns The text, or the key itself if it has none
 */
export function t(key: string, ...substitutions: string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}
