import { SvelteSet } from 'svelte/reactivity';

import type { ModuleEntry } from '@module/adapters/modules';

/** Every detail a module's drawer can show, in the order the drawer shows them. */
export const DRAWER_FIELDS = [
  'description',
  'authors',
  'languages',
  'links',
  'compatibility',
  'systems',
  'requires',
  'recommends',
  'conflicts',
  'packs',
  'library',
  'id',
] as const;

/** A detail a module's drawer can show. */
export type DrawerField = (typeof DRAWER_FIELDS)[number];

/** The details shown until a user chooses otherwise. */
export const DEFAULT_DRAWER_FIELDS: readonly DrawerField[] = ['description', 'authors', 'languages'];

/**
 * Whether a value names a drawer field.
 * @param value - The value
 * @returns `true` if it is one of {@link DRAWER_FIELDS}
 */
export function isDrawerField(value: unknown): value is DrawerField {
  return (DRAWER_FIELDS as readonly unknown[]).includes(value);
}

/**
 * Whether a module's manifest gives a detail, so that its drawer has something to show for it. Every module has an ID.
 * @param entry - The module
 * @param field - The detail
 * @returns `true` if there is something to show
 */
export function hasDetail(entry: ModuleEntry, field: DrawerField): boolean {
  switch (field) {
    case 'description':
      return entry.description !== '';
    case 'authors':
    case 'languages':
    case 'links':
    case 'packs':
      return entry[field].length > 0;
    case 'compatibility':
      return Object.keys(entry.compatibility).length > 0;
    case 'systems':
    case 'requires':
    case 'recommends':
    case 'conflicts':
      return entry.relationships[field].length > 0;
    case 'library':
      return entry.library;
    case 'id':
      return true;
  }
}

/**
 * The details the current user has chosen to show in module drawers. Reactive, so open drawers follow a change made
 * while EMMA is open.
 */
export class DrawerFields {
  readonly #shown = new SvelteSet<DrawerField>();

  /**
   * @param fields - The details to show
   */
  constructor(fields: Iterable<DrawerField> = DEFAULT_DRAWER_FIELDS) {
    this.set(fields);
  }

  /**
   * The details shown, in drawer order.
   * @returns The fields
   */
  get shown(): DrawerField[] {
    return DRAWER_FIELDS.filter(field => this.#shown.has(field));
  }

  /**
   * Whether a detail is shown.
   * @param field - The detail
   * @returns `true` if drawers show it
   */
  has(field: DrawerField): boolean {
    return this.#shown.has(field);
  }

  /**
   * Show these details, and no others.
   * @param fields - The details to show
   */
  set(fields: Iterable<DrawerField>): void {
    this.#shown.clear();
    for (const field of fields) this.#shown.add(field);
  }
}

/** The details shown in EMMA's drawers, kept in step with the user's setting. */
export const drawerFields = new DrawerFields();
