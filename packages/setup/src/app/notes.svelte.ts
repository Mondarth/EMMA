/**
 * The user's notes on what they ignore, lock or pin, such as why: a line each, kept for this server, and shown beside
 * the item in the tree, in its panel, and in the root's lists.
 */

/** What a note is on: the item ignored, locked, or pinned. */
export type NoteKind = 'ignore' | 'lock' | 'pin';

/** The longest a note may be, in characters. */
export const MAX_NOTE_LENGTH = 200;

/** Where the notes are kept, by `<kind>:<key>`, such as `ignore:module:dice`. */
export interface NoteStore {
  read(): Readonly<Record<string, string>>;
  write(notes: Readonly<Record<string, string>>): void;
}

/**
 * The note an item's text becomes: without the space around it, and no longer than a note may be.
 * @param text - The text given
 * @returns The note, empty for none
 */
function tidied(text: string): string {
  return text.trim().slice(0, MAX_NOTE_LENGTH).trim();
}

/** The user's notes, and their keeping. */
export class NoteState {
  readonly #store: NoteStore | undefined;
  #notes = $state.raw<Readonly<Record<string, string>>>({});

  /**
   * @param store - Where the notes are kept; without one, none can be kept
   */
  constructor(store?: NoteStore) {
    this.#store = store;
    this.#notes = store?.read() ?? {};
  }

  /**
   * Whether notes can be kept here.
   * @returns `true` where they can
   */
  get canKeep(): boolean {
    return this.#store !== undefined;
  }

  /**
   * The note on an item.
   * @param kind - What the note is on: the item ignored, locked or pinned
   * @param key - The item's key, such as `module:dice`, `world:alpha` or `core`
   * @returns The note, or `undefined` for none
   */
  of(kind: NoteKind, key: string): string | undefined {
    return this.#notes[`${kind}:${key}`];
  }

  /**
   * Keep a note on an item, or remove it.
   * @param kind - What the note is on
   * @param key - The item's key
   * @param text - The note; empty, or only space, removes it
   */
  set(kind: NoteKind, key: string, text: string): void {
    const id = `${kind}:${key}`;
    const note = tidied(text);
    if ((this.#notes[id] ?? '') === note) return;
    const rest = Object.fromEntries(Object.entries(this.#notes).filter(([other]) => other !== id));
    this.#keep(note === '' ? rest : { ...rest, [id]: note });
  }

  /**
   * Keep only the notes on what is still ignored, locked or pinned: a note on what no longer is goes with it.
   * @param holds - Whether an item is still ignored, locked or pinned
   */
  keepOnly(holds: (kind: NoteKind, key: string) => boolean): void {
    const kept = Object.entries(this.#notes).filter(([id]) => {
      const at = id.indexOf(':');
      return holds(id.slice(0, at) as NoteKind, id.slice(at + 1));
    });
    if (kept.length !== Object.keys(this.#notes).length) this.#keep(Object.fromEntries(kept));
  }

  /**
   * Have these be the notes, and keep them.
   * @param notes - The notes
   */
  #keep(notes: Readonly<Record<string, string>>): void {
    this.#notes = notes;
    this.#store?.write(notes);
  }
}
