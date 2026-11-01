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

/**
 * Today's date in the user's language, such as for a note.
 * @returns The date
 */
export function today(): string {
  return new Date().toLocaleDateString();
}

/** The units sizes are given in, each a thousand of the one before, as `Intl.NumberFormat` names them. */
const SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/**
 * A size in the user's language, in the largest unit it is at least one of, such as `1.2 GB`.
 * @param bytes - The size, in bytes
 * @returns The size, in words
 */
export function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < SIZE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: SIZE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
