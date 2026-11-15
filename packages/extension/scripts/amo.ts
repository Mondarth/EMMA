/**
 * The add-on as addons.mozilla.org (AMO) holds it, for a release that has to be signed again. AMO never takes the
 * same version twice: once a release has submitted a version, a release run again for it is refused ("Version …
 * already exists"), and one whose wait for the signature broke off has the signed add-on there, never downloaded.
 * Either way the signed add-on can be had from AMO's API, and used once it is shown to be this build: the extension
 * builds the same each time, its catalogue obscured the same way (see `obscure.ts` in the core), so its files are
 * byte for byte the build's, but for the signature Mozilla adds in `META-INF/`.
 *
 * AMO's API: https://mozilla.github.io/addons-server/topics/api/ (v5). An unlisted version needs the add-on's
 * developer's key, sent as a JSON Web Token.
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** AMO's API. */
export const AMO_API = 'https://addons.mozilla.org/api/v5';

/** An API key from AMO's developer hub: its issuer (the JWT issuer) and its secret. */
export interface AmoKey {
  readonly issuer: string;
  readonly secret: string;
}

/** A version's file, as AMO's API gives it. */
export interface AmoFile {
  /** Where to download it. */
  readonly url: string;
  /** `public` once signed; `unreviewed` while it waits; `disabled` if refused. */
  readonly status: string;
  /** Its hash, such as `sha256:<hex>`. */
  readonly hash?: string;
}

/**
 * The value of base64url, as JWT uses.
 * @param data - What to encode
 * @returns It, base64url-encoded
 */
const base64url = (data: string | Buffer): string => Buffer.from(data).toString('base64url');

/**
 * A JSON Web Token for AMO's API, signed with HS256 and good for a minute, as AMO asks.
 * @param key - The API key
 * @param now - The time now, in milliseconds since the epoch
 * @param jti - The token's unique id
 * @returns The token
 */
export function amoToken(key: AmoKey, now = Date.now(), jti: string = randomUUID()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: key.issuer, jti, iat: issuedAt, exp: issuedAt + 60 }));
  const signature = createHmac('sha256', key.secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** What talking to AMO needs. */
export interface AmoOptions {
  readonly key: AmoKey;
  /** How to fetch: `globalThis.fetch`, or a stand-in. */
  readonly send: typeof globalThis.fetch;
  /** Waits, in milliseconds. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * The file AMO holds for a version of the add-on, if it holds the version.
 * @param guid - The add-on's id, its `browser_specific_settings.gecko.id`
 * @param version - The version
 * @param options - The key, and how to fetch
 * @returns Its file, or `undefined` if AMO does not hold the version
 * @throws {Error} If AMO answers otherwise
 */
export async function amoFile(guid: string, version: string, options: AmoOptions): Promise<AmoFile | undefined> {
  const { key, send } = options;
  // A version number is looked up with a `v` before it; without, a number without dots is taken as an id.
  const url = `${AMO_API}/addons/addon/${encodeURIComponent(guid)}/versions/v${encodeURIComponent(version)}/`;
  const response = await send(url, { headers: { Authorization: `JWT ${amoToken(key)}` } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`AMO answered ${response.status} for ${guid} ${version}: ${await response.text()}`);
  const { file } = (await response.json()) as { file?: AmoFile };
  if (file === undefined || typeof file.url !== 'string') throw new Error(`AMO gave no file for ${guid} ${version}`);
  return file;
}

/** How long to wait for a version's signature: Mozilla signs an unlisted add-on in minutes. */
const WAIT_ATTEMPTS = 40;
const WAIT_MS = 30_000;

/**
 * The file AMO holds for a version of the add-on, once Mozilla has signed it.
 * @param guid - The add-on's id
 * @param version - The version
 * @param options - The key, how to fetch, and how to wait
 * @returns Its file, signed; or `undefined` if AMO does not hold the version
 * @throws {Error} If Mozilla refused it, or has not signed it within twenty minutes
 */
export async function signedAmoFile(guid: string, version: string, options: AmoOptions): Promise<AmoFile | undefined> {
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt++) {
    const file = await amoFile(guid, version, options);
    if (file === undefined || file.status === 'public') return file;
    if (file.status === 'disabled') throw new Error(`Mozilla refused to sign ${guid} ${version}`);
    if (attempt >= WAIT_ATTEMPTS) throw new Error(`Mozilla has not signed ${guid} ${version}: it is ${file.status}`);
    await sleep(WAIT_MS);
  }
}

/**
 * Download a version's signed file, checking it against the hash AMO gives.
 * @param file - The file
 * @param options - The key, and how to fetch
 * @returns Its bytes
 * @throws {Error} If it cannot be downloaded, or is not what AMO's hash says
 */
export async function downloadAmoFile(file: AmoFile, options: AmoOptions): Promise<Buffer> {
  const { key, send } = options;
  // An unlisted add-on's file is the developer's alone to download.
  const response = await send(file.url, { headers: { Authorization: `JWT ${amoToken(key)}` } });
  if (!response.ok) throw new Error(`Downloading ${file.url} failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const [algorithm, expected] = file.hash?.split(':') ?? [];
  if (algorithm === 'sha256' && createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error(`${file.url} is not the file AMO's hash says`);
  }
  return bytes;
}

/**
 * Every file under a folder, by its path relative to it, `/`-separated.
 * @param folder - The folder
 * @returns The paths
 */
function filesUnder(folder: string): string[] {
  return fs
    .readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/**
 * How a signed add-on, unpacked, differs from a build: the files one has and the other has not, and those both have
 * that differ. Mozilla's signature, in `META-INF/`, is not the build's, and is left out.
 * @param build - The build's folder
 * @param signed - The signed add-on's folder, unpacked
 * @returns What differs, each as `+ path` (only signed), `- path` (only the build) or `~ path`; none if it is the build
 */
export function differences(build: string, signed: string): string[] {
  const built = new Set(filesUnder(build));
  const got = new Set(filesUnder(signed).filter(file => !file.startsWith('META-INF/')));
  return [
    ...[...got].filter(file => !built.has(file)).map(file => `+ ${file}`),
    ...[...built].filter(file => !got.has(file)).map(file => `- ${file}`),
    ...[...built]
      .filter(file => got.has(file))
      .filter(file => !fs.readFileSync(path.join(build, file)).equals(fs.readFileSync(path.join(signed, file))))
      .map(file => `~ ${file}`),
  ].sort();
}
