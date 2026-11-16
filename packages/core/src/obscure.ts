/**
 * Text kept out of plain sight in the bundle: split into chunks, each masked by a pad of its own length. A search of
 * the bundle for the text, or for any long run of it, finds nothing.
 *
 * The pads are made from the text itself, not at random, so that building the same release twice gives the same
 * bundle: a release that has to be signed again can show the add-on signed before is this build (see the
 * extension's `scripts/amo.ts`). Randomness would hide nothing more, as each pad ships beside what it masks.
 *
 * It is not encryption: everything needed to reveal the text ships beside it, and the browser sends the text to the
 * proxy for anyone to read in its network tab. It keeps a secret out of casual sight, nothing more; see
 * docs/developers/default-catalogue.md.
 */

/**
 * The web APIs this uses. Every place EMMA runs has them, a Foundry world, the setup screen and Node alike, but this
 * package is compiled without the browser's or Node's declarations, so that nothing else of either creeps in.
 */
interface WebText {
  readonly TextEncoder: new () => { encode(text: string): Uint8Array };
  readonly TextDecoder: new () => { decode(bytes: Uint8Array): string };
}

const web = globalThis as unknown as WebText;

/** Each chunk of the text, as its pad and its bytes masked by the pad. */
export type Obscured = readonly (readonly [pad: readonly number[], masked: readonly number[]])[];

/** How many chunks a text is split into. */
const CHUNKS = 4;

/**
 * A 32-bit FNV-1a hash of some bytes, and a number besides, as the seed of a chunk's pad.
 * @param bytes - The text's bytes
 * @param salt - The chunk's index
 * @returns The hash, never 0
 */
function seedOf(bytes: Uint8Array, salt: number): number {
  let hash = 0x811c9dc5 ^ salt;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  // Odd, so never 0, which xorshift would never leave.
  return (hash | 1) >>> 0;
}

/**
 * Bytes that look random, the same each time for the same seed: an xorshift32 sequence.
 * @param count - How many
 * @param seed - The seed, not 0
 * @returns The bytes
 */
function padBytes(count: number, seed: number): Uint8Array {
  const pad = new Uint8Array(count);
  let state = seed;
  for (let at = 0; at < count; at++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    pad[at] = state >>> 24;
  }
  return pad;
}

/**
 * Obscure a text.
 * @param text - The text
 * @returns Its chunks, each with its pad
 */
export function obscure(text: string): Obscured {
  const bytes = new web.TextEncoder().encode(text);
  const chunks = Math.min(CHUNKS, bytes.length);
  const size = Math.ceil(bytes.length / chunks);
  return Array.from({ length: chunks }, (_, index) => {
    const chunk = bytes.slice(index * size, (index + 1) * size);
    const pad = padBytes(chunk.length, seedOf(bytes, index));
    // The pad is as long as the chunk, so has a byte for each of its bytes.
    return [[...pad], [...chunk.map((byte, at) => byte ^ (pad[at] as number))]] as const;
  });
}

/**
 * Reveal an obscured text.
 * @param obscured - The chunks, each with its pad
 * @returns The text
 */
export function reveal(obscured: Obscured): string {
  // Each pad is as long as its chunk.
  const bytes = obscured.flatMap(([pad, masked]) => masked.map((byte, at) => byte ^ (pad[at] as number)));
  return new web.TextDecoder().decode(new Uint8Array(bytes));
}
