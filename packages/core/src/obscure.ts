/**
 * Text kept out of plain sight in the bundle: split into chunks, each masked by a random pad of its own length. A
 * search of the bundle for the text, or for any long run of it, finds nothing.
 *
 * It is not encryption: everything needed to reveal the text ships beside it, and the browser sends the text to the
 * proxy for anyone to read in its network tab. It keeps a secret out of casual sight, nothing more; see
 * docs/developers/default-proxy.md.
 */

/**
 * The web APIs this uses. Every place EMMA runs has them, a Foundry world, the setup screen and Node alike, but this
 * package is compiled without the browser's or Node's declarations, so that nothing else of either creeps in.
 */
interface WebText {
  readonly crypto: { getRandomValues<T extends Uint8Array>(array: T): T };
  readonly TextEncoder: new () => { encode(text: string): Uint8Array };
  readonly TextDecoder: new () => { decode(bytes: Uint8Array): string };
}

const web = globalThis as unknown as WebText;

/** Each chunk of the text, as its pad and its bytes masked by the pad. */
export type Obscured = readonly (readonly [pad: readonly number[], masked: readonly number[]])[];

/** How many chunks a text is split into. */
const CHUNKS = 4;

/**
 * Random bytes.
 * @param count - How many
 * @returns The bytes
 */
function randomBytes(count: number): Uint8Array {
  return web.crypto.getRandomValues(new Uint8Array(count));
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
    const pad = randomBytes(chunk.length);
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
