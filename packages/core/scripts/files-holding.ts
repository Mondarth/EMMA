/**
 * Finds a secret built into a bundle in plain text, so that a release can refuse to ship it: the module's and the
 * browser extension's release scripts check their builds with it.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * The files under a directory that hold a secret in plain text.
 * @param dir - The directory, such as `dist`
 * @param secret - The secret
 * @returns Their paths
 */
export function filesHolding(dir: string, secret: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => fs.readFileSync(file, 'utf8').includes(secret));
}
