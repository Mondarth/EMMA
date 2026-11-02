/**
 * A manifest URL the user gives, to install a package from: whether what it answers is a manifest, and of which type of
 * package. Foundry installs a manifest as whichever type it is asked to, so EMMA checks it is the type the user is
 * installing first: by the manifest's file name, `module.json` or `system.json` and their like, and failing that by the
 * fields only a game system's manifest declares. Pure: it works on plain values only.
 */

/** What a manifest names its package by. */
export interface ManifestShape {
  readonly id: string;
  readonly title: string;
  readonly version: string;
}

/** Fields only a game system's manifest declares. */
const SYSTEM_FIELDS: readonly string[] = [
  'initiative',
  'grid',
  'gridDistance',
  'gridUnits',
  'primaryTokenAttribute',
  'secondaryTokenAttribute',
];

/**
 * What a manifest names its package by.
 * @param json - What the URL answered, parsed
 * @returns Its ID, title and version, or `undefined` if it is no manifest
 */
export function manifestShape(json: unknown): ManifestShape | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const { id, title, version } = json as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return undefined;
  if ((typeof version !== 'string' || version === '') && typeof version !== 'number') return undefined;
  return { id, title: typeof title === 'string' && title !== '' ? title : id, version: String(version) };
}

/**
 * The type of package a manifest is of, as far as it shows.
 * @param url - Its URL
 * @param json - It, parsed
 * @returns `module` or `system`, or `undefined` if it does not show
 */
export function manifestTypeOf(url: string, json: unknown): 'module' | 'system' | undefined {
  let file = '';
  try {
    file = new URL(url).pathname.split('/').at(-1)?.toLowerCase() ?? '';
  } catch {
    // Not a URL: only its fields can tell.
  }
  if (/^module\b.*\.json$/.test(file)) return 'module';
  if (/^system\b.*\.json$/.test(file)) return 'system';
  const fields = typeof json === 'object' && json !== null ? Object.keys(json) : [];
  return fields.some(field => SYSTEM_FIELDS.includes(field)) ? 'system' : undefined;
}
