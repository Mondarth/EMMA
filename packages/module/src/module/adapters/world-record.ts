/**
 * The only place EMMA reads or writes the world record (see `lib/world-record.ts`) on the Foundry server. The record
 * is written with Foundry's file upload, as a GM would upload an image, and read back as the static file the server
 * serves.
 */
import { readActivation } from '@module/adapters/modules';
import { readPlatform } from '@module/adapters/platform';
import { MODULE_ID } from '@module/lib/constants';
import type { WorldRecord, WorldRecordContent } from '@mondarth/emma-core/world-record';
import { WORLD_RECORD_FILE, WORLD_RECORD_SCHEMA } from '@mondarth/emma-core/world-record';

/** The file source that holds the user data folder, where the worlds are. */
const SOURCE = 'data';

/**
 * The world's folder, as a path in the user data folder.
 * @returns The path, such as `worlds/my-world`
 */
function worldFolder(): string {
  return `worlds/${game.world.id}`;
}

/**
 * Whether the current user may keep the world record: a GM (or assistant GM) allowed to browse and upload files.
 * @returns `true` if {@link readWorldRecord} and {@link writeWorldRecord} are allowed
 */
export function canKeepWorldRecord(): boolean {
  const user = game.user;
  return user !== null && user.isGM && user.can('FILES_BROWSE') && user.can('FILES_UPLOAD');
}

/**
 * Whether the current user is the world's active GM, the one GM chosen to do work that only one should.
 * @returns `true` for the active GM
 */
export function isActiveGM(): boolean {
  return game.users?.activeGM?.isSelf === true;
}

/**
 * Describe the world as the record should: the Foundry version and game system in use, and the installed modules the
 * world has saved as active, which are those it runs with once it reloads.
 * @returns What the record should say
 */
export function describeWorld(): WorldRecordContent {
  const { core, system } = readPlatform();
  const activation = readActivation();
  const modules = Array.from(game.modules.values())
    .filter(({ id }) => activation[id] === true)
    .map(({ id, title, version }) => ({ id, title, version }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schema: WORLD_RECORD_SCHEMA,
    emma: game.modules.get(MODULE_ID)?.version ?? '',
    world: { id: game.world.id, title: game.world.title },
    core,
    system: { id: system.id, title: system.title, version: system.version },
    modules,
  };
}

/**
 * Read the world record. The folder is listed first, so that a missing record costs no failed request, which the
 * browser would log as an error.
 * @returns The record as parsed, which may be anything; `undefined` if there is none or it is not JSON
 * @throws {Error} If the folder cannot be listed or the record cannot be fetched
 */
export async function readWorldRecord(): Promise<unknown> {
  const { files } = await foundry.applications.apps.FilePicker.implementation.browse(SOURCE, worldFolder());
  if (!files.some(file => file.endsWith(`/${WORLD_RECORD_FILE}`))) return undefined;

  const response = await fetch(foundry.utils.getRoute(`${worldFolder()}/${WORLD_RECORD_FILE}`), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to read the world record: HTTP ${String(response.status)}`);
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Write the world record, replacing any there is.
 * @param record - The record
 * @throws {Error} If the server does not save it
 */
export async function writeWorldRecord(record: WorldRecord): Promise<void> {
  const file = new File([`${JSON.stringify(record, null, 2)}\n`], WORLD_RECORD_FILE, { type: 'application/json' });
  const result = await foundry.applications.apps.FilePicker.implementation.upload(
    SOURCE,
    worldFolder(),
    file,
    {},
    { notify: false },
  );
  // A refusal is false, a malformed answer nothing or an empty object; only success has a status.
  if (typeof result !== 'object' || !('status' in result)) {
    throw new Error('The server did not save the world record');
  }
}
