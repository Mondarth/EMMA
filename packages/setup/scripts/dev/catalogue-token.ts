/**
 * Development only: the token the setup screen's dev server asks a development catalogue with, in place of the
 * browser extension, which is not there to hold one. `pnpm dev:sign-in` keeps it (see `sign-in.ts`), for the
 * catalogue it was given by, in a file of its own that git ignores; never commit it.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The file, from the repository's root. */
export const TOKEN_FILE = '.foundryvtt/catalogue-token.json';

/**
 * The token kept for a catalogue, if one is.
 * @param root - The repository's root
 * @param catalogue - The catalogue's URL: a token kept for another is not its
 * @returns The token
 */
export function readDevToken(root: string, catalogue: string): string | undefined {
  const file = path.resolve(root, TOKEN_FILE);
  if (!fs.existsSync(file)) return undefined;
  try {
    const kept = JSON.parse(fs.readFileSync(file, 'utf8')) as { catalogue?: unknown; token?: unknown };
    return kept.catalogue === catalogue && typeof kept.token === 'string' && kept.token !== '' ? kept.token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keep the token for a catalogue, replacing any kept before.
 * @param root - The repository's root
 * @param catalogue - The catalogue's URL
 * @param token - The token
 */
export function writeDevToken(root: string, catalogue: string, token: string): void {
  const file = path.resolve(root, TOKEN_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ catalogue, token })}\n`, { mode: 0o600 });
}

/**
 * Forget the token.
 * @param root - The repository's root
 */
export function forgetDevToken(root: string): void {
  fs.rmSync(path.resolve(root, TOKEN_FILE), { force: true });
}
