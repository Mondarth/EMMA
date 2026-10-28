/**
 * The world record: a JSON file EMMA keeps in the root of each world's folder, describing the setup the world is saved
 * to run with. Foundry serves world folders as static files, even while no world is running, so a tool on the Setup
 * screen can read the record and check a world before it is launched. World backups zip the whole folder, so the
 * record goes with the world into its backups and comes back with it on a restore.
 */

/** The record's file name, in the root of the world's folder. */
export const WORLD_RECORD_FILE = 'mondarth-emma.json';

/** The version of the record's format. Raise it when a change would mislead a reader of the old format. */
export const WORLD_RECORD_SCHEMA = 1;

/** A package as the record gives it. */
export interface RecordedPackage {
  readonly id: string;
  readonly title: string;
  readonly version: string;
}

/** The content of the world record. */
export interface WorldRecord {
  readonly schema: typeof WORLD_RECORD_SCHEMA;
  /** The version of EMMA that wrote the record. */
  readonly emma: string;
  readonly world: { readonly id: string; readonly title: string };
  /** The Foundry version, such as `14.368`. */
  readonly core: string;
  /** The game system. */
  readonly system: RecordedPackage;
  /** The modules the world has saved as active, sorted by ID. */
  readonly modules: readonly RecordedPackage[];
  /** When the record was written, as an ISO 8601 time. */
  readonly updated: string;
}

/** What the record says about the world: all of it but when it was written. */
export type WorldRecordContent = Omit<WorldRecord, 'updated'>;

/**
 * Date a record's content, ready to write.
 * @param content - What the record says
 * @param now - When it is written
 * @returns The record
 */
export function stampRecord(content: WorldRecordContent, now: Date): WorldRecord {
  return { ...content, updated: now.toISOString() };
}

/**
 * Whether a record read back from the server says what `content` says. When it was written is ignored, so a record
 * that is only older is not rewritten.
 * @param saved - The record as read, which may be anything
 * @param content - What the record should say
 * @returns `true` if the record says exactly that
 */
export function recordHolds(saved: unknown, content: WorldRecordContent): boolean {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return false;
  const said = Object.fromEntries(Object.entries(saved).filter(([key]) => key !== 'updated'));
  return canonical(said) === canonical(content);
}

/**
 * Write a value as JSON with every object's keys sorted, so equal values give equal text whatever their key order.
 * @param value - A value read from JSON, or built to be written as JSON
 * @returns The JSON text
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : nested,
  );
}
