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
      ? // An object's keys are never equal, so two keys are always in one order or the other.
        Object.fromEntries(Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : 1)))
      : nested,
  );
}

/**
 * Read a record as it was parsed from the world's folder, which anything may have written.
 * @param value - The parsed JSON
 * @returns The record, or `undefined` if it is not a record of this format
 */
export function parseWorldRecord(value: unknown): WorldRecord | undefined {
  if (!isObject(value) || value.schema !== WORLD_RECORD_SCHEMA) return undefined;
  const { emma, world, core, system, modules, updated } = value;
  if (typeof emma !== 'string' || typeof core !== 'string' || typeof updated !== 'string') return undefined;
  if (!isObject(world) || typeof world.id !== 'string' || typeof world.title !== 'string') return undefined;
  const recordedSystem = recordedPackage(system);
  if (recordedSystem === undefined || !Array.isArray(modules)) return undefined;
  const recordedModules = modules.map(recordedPackage);
  if (recordedModules.some(entry => entry === undefined)) return undefined;
  return {
    schema: WORLD_RECORD_SCHEMA,
    emma,
    world: { id: world.id, title: world.title },
    core,
    system: recordedSystem,
    modules: recordedModules as RecordedPackage[],
    updated,
  };
}

/**
 * Read a package as a record gives it.
 * @param value - The parsed JSON
 * @returns The package, or `undefined` if it is not one
 */
function recordedPackage(value: unknown): RecordedPackage | undefined {
  if (!isObject(value)) return undefined;
  const { id, title, version } = value;
  return typeof id === 'string' && typeof title === 'string' && typeof version === 'string'
    ? { id, title, version }
    : undefined;
}

/**
 * Whether a value is a plain JSON object.
 * @param value - Any value
 * @returns `true` for an object that is not an array
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
