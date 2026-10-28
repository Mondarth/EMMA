/**
 * EMMA's text on the setup screen. Foundry's own translations there do not include EMMA's, so EMMA brings its
 * dictionary with it, in English for now.
 */
import en from '../lang/en.json';

/**
 * Translate a key, such as `Root.Heading`.
 * @param key - A key of `lang/en.json`, its parts joined by dots
 * @returns The text, or the key itself if it has none
 */
export function localize(key: string): string {
  let value: unknown = en;
  for (const part of key.split('.')) {
    value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined;
  }
  return typeof value === 'string' ? value : key;
}

/**
 * Translate a key and fill in its `{placeholders}`.
 * @param key - A key of `lang/en.json`
 * @param data - The values of its placeholders; a placeholder without one is left as it is
 * @returns The text
 */
export function format(key: string, data: Readonly<Record<string, string | number>>): string {
  return localize(key).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in data ? String(data[name]) : placeholder,
  );
}
