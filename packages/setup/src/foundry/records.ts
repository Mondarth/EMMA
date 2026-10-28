/**
 * Reads the world records EMMA keeps in each world's folder (see `@mondarth/emma-core/world-record`). The setup screen
 * belongs to the server's administrator, who may browse the user data folder, so each world's folder is listed first:
 * a missing record then costs no failed request, which the browser would log as an error.
 */
import type { WorldRecord } from '@mondarth/emma-core/world-record';
import { parseWorldRecord, WORLD_RECORD_FILE } from '@mondarth/emma-core/world-record';

/** What a world's folder holds of its record. */
export type RecordState =
  | { readonly kind: 'recorded'; readonly record: WorldRecord }
  /** No record: the world has not been opened with EMMA 0.9 or later active. */
  | { readonly kind: 'none' }
  /** A record that cannot be read, or is not of a format EMMA knows. */
  | { readonly kind: 'unreadable' };

/**
 * Read one world's record.
 * @param worldId - The world's ID
 * @returns What its folder holds of its record
 */
export async function readRecord(worldId: string): Promise<RecordState> {
  const folder = `worlds/${worldId}`;
  try {
    const { files } = await foundry.applications.apps.FilePicker.implementation.browse('data', folder);
    if (!files.some(file => file.endsWith(`/${WORLD_RECORD_FILE}`))) return { kind: 'none' };
    const response = await fetch(foundry.utils.getRoute(`${folder}/${WORLD_RECORD_FILE}`), { cache: 'no-store' });
    if (!response.ok) return { kind: 'unreadable' };
    const record = parseWorldRecord(await response.json());
    return record === undefined ? { kind: 'unreadable' } : { kind: 'recorded', record };
  } catch {
    return { kind: 'unreadable' };
  }
}

/**
 * Read the records of several worlds at once.
 * @param worldIds - The worlds' IDs
 * @returns What each world's folder holds of its record, by world ID
 */
export async function readRecords(worldIds: readonly string[]): Promise<Map<string, RecordState>> {
  const states = await Promise.all(worldIds.map(async id => [id, await readRecord(id)] as const));
  return new Map(states);
}
