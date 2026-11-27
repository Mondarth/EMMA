/**
 * The browser extension on addons.mozilla.org (AMO): each release submits its Firefox build as a **listed** version,
 * for Mozilla's review, with the listing `store/amo-metadata.json` gives and the source the build is made from. The
 * release does not wait for the review, which may take days: Mozilla signs the version once it approves it, and Firefox
 * users get it from AMO. AMO never takes the same version twice, so a release run again for a version AMO holds already
 * submits nothing more.
 *
 * AMO's API: https://mozilla.github.io/addons-server/topics/api/ (v5), with the add-on's developer's key, sent as a
 * JSON Web Token.
 */

import { createHmac, randomUUID } from 'node:crypto';

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
  /** `public` once signed; `unreviewed` while it waits for review; `disabled` if refused. */
  readonly status: string;
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
  /** Waits, in milliseconds: between asking whether an upload is validated. */
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

/** The add-on's listing, as `store/amo-metadata.json` gives it. */
export interface AmoListing {
  /** The add-on's own fields, as AMO's add-on edit takes them: name, summary, description, categories, and so on. */
  readonly [field: string]: unknown;
  /** The version's own: its licence, and the notes to Mozilla's reviewers. */
  readonly version: { readonly license: string; readonly approval_notes?: string };
}

/** The fields of the listing AMO's add-on edit takes; the others, such as `support_url`, are set on AMO's site. */
const EDITABLE = [
  'categories',
  'contributions_url',
  'description',
  'homepage',
  'is_experimental',
  'name',
  'requires_payment',
  'summary',
  'support_email',
  'tags',
] as const;

/** A request to AMO's API: its method, and a body of form data or JSON, or none. */
interface AmoRequest {
  readonly method: string;
  readonly body?: FormData;
  readonly json?: unknown;
}

/**
 * Ask AMO's API, with the key.
 * @param path - The path, under {@link AMO_API}
 * @param init - The request
 * @param options - The key, and how to fetch
 * @returns What AMO answered, as JSON
 * @throws {Error} If AMO did not answer with success
 */
async function amo(path: string, init: AmoRequest, options: AmoOptions) {
  const { key, send } = options;
  const json = init.json !== undefined;
  const response = await send(`${AMO_API}${path}`, {
    method: init.method,
    headers: { Authorization: `JWT ${amoToken(key)}`, ...(json && { 'Content-Type': 'application/json' }) },
    body: json ? JSON.stringify(init.json) : (init.body ?? null),
  });
  if (!response.ok)
    throw new Error(`AMO answered ${response.status} to ${init.method} ${path}: ${await response.text()}`);
  return (await response.json()) as unknown;
}

/**
 * Set the add-on's listing on AMO, which a listed version needs: its name, summary, categories and the rest.
 * @param guid - The add-on's id
 * @param listing - The listing
 * @param options - The key, and how to fetch
 */
export async function editListing(guid: string, listing: AmoListing, options: AmoOptions): Promise<void> {
  const fields = Object.fromEntries(EDITABLE.flatMap(field => (field in listing ? [[field, listing[field]]] : [])));
  await amo(`/addons/addon/${encodeURIComponent(guid)}/`, { method: 'PATCH', json: fields }, options);
}

/** How long to wait for AMO to validate an upload: it takes seconds, or a few minutes when busy. */
const VALIDATION_ATTEMPTS = 60;
const VALIDATION_MS = 10_000;

/**
 * Upload the add-on's build to AMO on the listed channel, and wait for AMO to validate it.
 * @param build - The build, zipped
 * @param options - The key, how to fetch, and how to wait
 * @returns The upload's id, to create the version with
 * @throws {Error} If AMO finds the build invalid, or has not validated it within ten minutes
 */
export async function uploadListed(build: Buffer, options: AmoOptions): Promise<string> {
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const form = new FormData();
  form.append('upload', new Blob([new Uint8Array(build)]), 'emma-extension-firefox.zip');
  form.append('channel', 'listed');
  let upload = (await amo('/addons/upload/', { method: 'POST', body: form }, options)) as AmoUpload;
  for (let attempt = 1; !upload.processed; attempt++) {
    if (attempt >= VALIDATION_ATTEMPTS) throw new Error(`AMO has not validated the upload ${upload.uuid}`);
    await sleep(VALIDATION_MS);
    upload = (await amo(`/addons/upload/${upload.uuid}/`, { method: 'GET' }, options)) as AmoUpload;
  }
  if (!upload.valid) {
    const messages = (upload.validation?.messages ?? [])
      .filter(({ type }) => type === 'error')
      .map(({ message }) => message);
    throw new Error(`AMO found the build invalid: ${messages.join('; ') || 'no reason given'}`);
  }
  return upload.uuid;
}

/** An upload, as AMO's API gives it. */
interface AmoUpload {
  readonly uuid: string;
  readonly processed: boolean;
  readonly valid: boolean;
  readonly validation?: { readonly messages?: readonly { readonly type: string; readonly message: string }[] } | null;
}

/**
 * Submit a release of the add-on to AMO as a listed version, for Mozilla's review, unless AMO holds the version
 * already: set the listing, upload the build, create the version with its licence and notes to the reviewers, and
 * attach the source it is built from. Nothing waits for the review.
 * @param guid - The add-on's id
 * @param version - The release's version
 * @param files - The build, zipped, and the source, archived
 * @param files.build - The build
 * @param files.source - The source
 * @param listing - The listing
 * @param options - The key, how to fetch, and how to wait
 * @returns `submitted`, or `held` if AMO holds the version already
 */
export async function submitListed(
  guid: string,
  version: string,
  files: { readonly build: Buffer; readonly source: Buffer },
  listing: AmoListing,
  options: AmoOptions,
): Promise<'submitted' | 'held'> {
  if ((await amoFile(guid, version, options)) !== undefined) return 'held';
  await editListing(guid, listing, options);
  const upload = await uploadListed(files.build, options);
  const addon = `/addons/addon/${encodeURIComponent(guid)}/versions/`;
  const created = (await amo(
    addon,
    {
      method: 'POST',
      json: { upload, license: listing.version.license, approval_notes: listing.version.approval_notes ?? '' },
    },
    options,
  )) as { id: number };
  // The source goes as a file of its own: AMO takes it as form data alone.
  const form = new FormData();
  form.append('source', new Blob([new Uint8Array(files.source)]), `emma-source-v${version}.zip`);
  await amo(`${addon}${String(created.id)}/`, { method: 'PATCH', body: form }, options);
  return 'submitted';
}
