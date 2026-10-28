import type { ModuleEntry } from '@module/adapters/modules';

/**
 * Build a module entry as the adapter would list it, with nothing but what a test sets.
 * @param fields - Its ID, and any other fields the test needs; the title defaults to the ID
 * @returns The entry
 */
export function moduleEntry(fields: Pick<ModuleEntry, 'id'> & Partial<ModuleEntry>): ModuleEntry {
  return {
    title: fields.id,
    version: '1.0.0',
    badge: null,
    description: '',
    authors: [],
    languages: [],
    links: [],
    compatibility: {},
    relationships: { systems: [], requires: [], recommends: [], conflicts: [] },
    packs: [],
    library: false,
    requires: [],
    ...fields,
  };
}
