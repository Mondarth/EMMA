/**
 * How the EMMA extension on the setup screen asks the catalogue as its signed-in user, without Foundry's page ever
 * holding the user's token: shared by the setup screen's script (`@mondarth/emma-setup`), which runs in the page, and
 * the browser extension (`@mondarth/emma-extension`), which keeps the token.
 *
 * 1. The setup screen's script posts a {@link RelayRequest} to its own window, from {@link PAGE_SOURCE}.
 * 2. The extension's bridge, a content script in the same tab but a world of its own, takes it to the extension's
 *    background script ({@link CATALOGUE_REQUEST_MESSAGE}).
 * 3. The background script asks the catalogue with the user's token, if the request is one it lets through
 *    ({@link parseRelayRequest}), and the bridge posts its {@link RelayAnswer} back, from {@link BRIDGE_SOURCE}.
 *
 * The catalogue's paths are fixed by its API, version 2, under its root: those the extension calls, and no others.
 */

/** The catalogue's endpoints the extension asks: its lookups, listing, manifests and rechecks, and whose token it holds. */
export const RELAY_PATHS: readonly string[] = [
  '/api/v2/lookup',
  '/api/v2/listing',
  '/api/v2/manifest',
  '/api/v2/recheck',
  '/api/v2/me',
];

/** Where the catalogue says whose token it is (see `GET /api/v2/me`). */
export const ME_PATH = '/api/v2/me';

/** The request headers the extension passes on, lower-cased: any other the page gives is dropped. */
export const RELAY_HEADERS: readonly string[] = ['content-type', 'if-none-match', 'x-catalogue-client'];

/** The answer's headers the page is given, lower-cased. */
export const ANSWER_HEADERS: readonly string[] = ['content-type', 'etag'];

/** Who posts a request to the window: the setup screen's script. */
export const PAGE_SOURCE = 'mondarth-emma/page';

/** Who posts an answer to the window: the extension's bridge. */
export const BRIDGE_SOURCE = 'mondarth-emma/bridge';

/** The message the bridge sends the background script with a request. */
export const CATALOGUE_REQUEST_MESSAGE = 'mondarth-emma/catalogue-request';

/** The message the bridge sends the background script to open the extension's sign-in, on the user's click. */
export const OPEN_SIGN_IN_MESSAGE = 'mondarth-emma/open-sign-in';

/** A request to the catalogue, as the page posts it. */
export interface RelayRequest {
  /** The catalogue's URL, with the endpoint's path and query. */
  readonly url: string;
  readonly method: 'GET' | 'POST';
  /** Lower-cased names; only {@link RELAY_HEADERS}. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** The catalogue's answer, as the page is given it, or `unreachable` if there was none. */
export type RelayAnswer =
  | {
      readonly status: number;
      /** Lower-cased names; only {@link ANSWER_HEADERS}. */
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
    }
  | { readonly unreachable: true };

/** What the page posts: a request, or asking for the sign-in, each with an id its answer carries. */
export type PagePost =
  | { readonly source: typeof PAGE_SOURCE; readonly id: string; readonly request: RelayRequest }
  | { readonly source: typeof PAGE_SOURCE; readonly id: string; readonly openSignIn: true };

/** What the bridge posts back. */
export interface BridgePost {
  readonly source: typeof BRIDGE_SOURCE;
  readonly id: string;
  readonly answer: RelayAnswer;
}

/**
 * A request the extension lets through to the catalogue: to the catalogue's own origin, one of {@link RELAY_PATHS},
 * with only {@link RELAY_HEADERS}.
 * @param value - What was given
 * @param catalogue - The catalogue's URL
 * @returns The request, with only the headers let through, or `undefined` if it is not one to let through
 */
export function parseRelayRequest(value: unknown, catalogue: string): RelayRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { url, method, headers, body } = value as Record<string, unknown>;
  if (typeof url !== 'string' || !URL.canParse(url)) return undefined;
  const target = new URL(url);
  if (target.origin !== new URL(catalogue).origin || !RELAY_PATHS.includes(target.pathname)) return undefined;
  if (target.username !== '' || target.password !== '' || target.hash !== '') return undefined;
  if (method !== 'GET' && method !== 'POST') return undefined;
  if (body !== undefined && (typeof body !== 'string' || method === 'GET')) return undefined;
  const kept: Record<string, string> = {};
  if (typeof headers === 'object' && headers !== null) {
    for (const [name, given] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (RELAY_HEADERS.includes(lower) && typeof given === 'string') kept[lower] = given;
    }
  }
  return { url: target.href, method, headers: kept, ...(body !== undefined && { body }) };
}

/** Whether the user may use the catalogue through the extension, as `GET /api/v2/me` says. */
export type Account =
  /** No token is kept, or the catalogue no longer takes it: the user signs in. */
  | { readonly state: 'signed-out' }
  /** Signed in, without a subscription: until when it last ran, if it ever did. */
  | { readonly state: 'lapsed'; readonly paidUntil: string | null }
  /** Signed in, and subscribed (or an admin). */
  | { readonly state: 'entitled'; readonly handle: string; readonly paidUntil: string | null }
  /** The catalogue did not answer, or not as its API says. */
  | { readonly state: 'unreachable' };

/**
 * The account, from the catalogue's answer to `GET /api/v2/me`.
 * @param answer - The answer
 * @returns Whether the user may use the catalogue
 */
export function accountOf(answer: RelayAnswer): Account {
  if ('unreachable' in answer) return { state: 'unreachable' };
  if (answer.status === 401) return { state: 'signed-out' };
  if (answer.status !== 200) return { state: 'unreachable' };
  let read: unknown;
  try {
    read = JSON.parse(answer.body);
  } catch {
    return { state: 'unreachable' };
  }
  const me = read as { user?: { handle?: unknown }; entitled?: unknown; subscription?: { paidUntil?: unknown } };
  const handle = me.user?.handle;
  const paidUntil = me.subscription?.paidUntil;
  if (typeof handle !== 'string' || typeof me.entitled !== 'boolean') return { state: 'unreachable' };
  const until = typeof paidUntil === 'string' ? paidUntil : null;
  return me.entitled ? { state: 'entitled', handle, paidUntil: until } : { state: 'lapsed', paidUntil: until };
}
