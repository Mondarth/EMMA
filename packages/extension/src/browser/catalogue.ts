/**
 * EMMA's catalogue, as the extension asks it: as its signed-in user, with the token the catalogue gave it when they
 * approved this browser (OAuth 2's device authorization grant, RFC 8628). The token is kept in the extension's storage,
 * which Foundry's pages cannot read, and only the background script sends it (see `@mondarth/emma-core/catalogue-relay`).
 */
import type { RelayAnswer } from '@mondarth/emma-core/catalogue-relay';
import { ANSWER_HEADERS, parseRelayRequest } from '@mondarth/emma-core/catalogue-relay';

import { readRelayTabs } from './api';
import { originOf } from '../lib/sites';

/** The key the user's token is kept under, in the extension's local storage. */
export const TOKEN_KEY = 'catalogueToken';

/** The extension's client, as the catalogue knows it. */
export const CLIENT_ID = 'emma-extension';

/** The grant a device polls for its token by. */
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/**
 * The user's token, if one is kept.
 * @returns The token
 */
export async function readToken(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const value: unknown = stored[TOKEN_KEY];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Keep the user's token.
 * @param token - The token
 */
export async function keepToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

/** Forget the user's token. */
export async function forgetToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

/** The answer given for the user, without asking, when no token is kept: as the catalogue answers one it does not take. */
const SIGNED_OUT: RelayAnswer = {
  status: 401,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'unauthorised', message: 'Not signed in', requestId: 'emma-extension' } }),
};

/** Who asked the background script, as the browser says. */
export interface Sender {
  readonly id?: string | undefined;
  readonly frameId?: number | undefined;
  readonly url?: string | undefined;
  readonly tab?: { readonly id?: number | undefined } | undefined;
}

/**
 * Whether a tab's page may have the catalogue asked for it: EMMA's own bridge, in a tab the extension brought EMMA into,
 * still on the server it was brought in on.
 * @param sender - Who asked
 * @returns `true` if it may
 */
export async function mayRelay(sender: Sender): Promise<boolean> {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined) return false;
  const server = originOf(sender.url);
  return server !== undefined && (await readRelayTabs())[String(sender.tab.id)] === server;
}

/**
 * Ask the catalogue for a tab's page, as the user, if the request is one to let through.
 * @param given - The request, as the page posted it
 * @param catalogue - The catalogue's URL, or `null` for a build without one
 * @param send - How to fetch, as a test gives its own
 * @returns The answer; `undefined` for a request not let through
 */
export async function relay(
  given: unknown,
  catalogue: string | null,
  send: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<RelayAnswer | undefined> {
  if (catalogue === null) return undefined;
  const request = parseRelayRequest(given, catalogue);
  if (request === undefined) return undefined;
  const token = await readToken();
  if (token === undefined) return SIGNED_OUT;
  let response: Response;
  try {
    response = await send(request.url, {
      method: request.method,
      headers: { ...request.headers, authorization: `Bearer ${token}` },
      ...(request.body !== undefined && { body: request.body }),
      // The catalogue is asked with the token alone: never with any cookie of the website's, nor followed elsewhere.
      credentials: 'omit',
      redirect: 'error',
    });
  } catch {
    return { unreachable: true };
  }
  // A token the catalogue no longer takes, signed out or expired, is forgotten: the user signs in again.
  if (response.status === 401) await forgetToken();
  const headers: Record<string, string> = {};
  for (const name of ANSWER_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return { status: response.status, headers, body: await response.text() };
}

/** The codes the catalogue gives the extension to sign its user in with. */
export interface DeviceCodes {
  /** Kept to the extension: it polls for the token with it. */
  readonly deviceCode: string;
  /** Shown to the user, to check against the catalogue's page. */
  readonly userCode: string;
  /** The catalogue's page, with the code, where the user approves this browser. */
  readonly verificationUri: string;
  /** How long the codes last, in seconds. */
  readonly expiresIn: number;
  /** How long to wait between polls, in seconds. */
  readonly interval: number;
}

/**
 * Ask the catalogue for codes to sign the user in with.
 * @param catalogue - The catalogue's URL
 * @param send - How to fetch
 * @returns The codes, or `undefined` if the catalogue could not be asked, or gave none
 */
export async function askCodes(
  catalogue: string,
  send: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<DeviceCodes | undefined> {
  try {
    const response = await send(new URL('/auth/device/code', catalogue).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID }),
      credentials: 'omit',
    });
    if (!response.ok) return undefined;
    const read = (await response.json()) as Record<string, unknown>;
    const { device_code: deviceCode, user_code: userCode, verification_uri_complete: page } = read;
    const { expires_in: expiresIn, interval } = read;
    if (typeof deviceCode !== 'string' || typeof userCode !== 'string' || typeof page !== 'string') return undefined;
    // The page must be the catalogue's own: the user is sent there to approve this browser.
    if (!URL.canParse(page) || new URL(page).origin !== new URL(catalogue).origin) return undefined;
    return {
      deviceCode,
      userCode,
      verificationUri: page,
      expiresIn: typeof expiresIn === 'number' ? expiresIn : 600,
      interval: typeof interval === 'number' ? interval : 5,
    };
  } catch {
    return undefined;
  }
}

/** What polling for the token gave. */
export type Poll =
  | { readonly state: 'pending' | 'slow-down' | 'denied' | 'expired' | 'failed' }
  | { readonly state: 'approved'; readonly token: string };

/**
 * Poll the catalogue once for the token.
 * @param catalogue - The catalogue's URL
 * @param deviceCode - The device code
 * @param send - How to fetch
 * @returns What it gave
 */
export async function pollToken(
  catalogue: string,
  deviceCode: string,
  send: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Poll> {
  let read: Record<string, unknown>;
  try {
    const response = await send(new URL('/auth/device/token', catalogue).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code: deviceCode, client_id: CLIENT_ID }),
      credentials: 'omit',
    });
    read = (await response.json()) as Record<string, unknown>;
  } catch {
    return { state: 'failed' };
  }
  if (typeof read['access_token'] === 'string' && read['access_token'] !== '') {
    return { state: 'approved', token: read['access_token'] };
  }
  switch (read['error']) {
    case 'authorization_pending':
      return { state: 'pending' };
    case 'slow_down':
      return { state: 'slow-down' };
    case 'access_denied':
      return { state: 'denied' };
    case 'expired_token':
      return { state: 'expired' };
    default:
      return { state: 'failed' };
  }
}

/** How a sign-in ended. */
export type SignInEnd = 'approved' | 'denied' | 'expired' | 'failed' | 'cancelled';

/** What a sign-in is given. */
export interface SignInOptions {
  /** Shows the user the code, and where to approve this browser. */
  readonly onCodes: (codes: DeviceCodes) => void;
  /** Opens the catalogue's page for the user. */
  readonly openPage: (url: string) => void;
  /** Ends the sign-in early, as the user asks. */
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
  /** Waits, as a test gives its own. */
  readonly wait?: (ms: number) => Promise<void>;
  /** The time now, in milliseconds. */
  readonly now?: () => number;
}

/**
 * Sign the user in: ask for codes, open the catalogue's page for them to approve this browser, and poll for the token
 * until they do, or deny it, or the codes expire, keeping the token once given.
 * @param catalogue - The catalogue's URL
 * @param options - What the sign-in is given
 * @returns How it ended
 */
export async function signIn(catalogue: string, options: SignInOptions): Promise<SignInEnd> {
  const {
    onCodes,
    openPage,
    signal,
    fetch: send = globalThis.fetch.bind(globalThis),
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = Date.now,
  } = options;
  const codes = await askCodes(catalogue, send);
  if (codes === undefined) return 'failed';
  onCodes(codes);
  openPage(codes.verificationUri);
  const until = now() + codes.expiresIn * 1000;
  let interval = codes.interval;
  for (;;) {
    await wait(interval * 1000);
    if (signal?.aborted === true) return 'cancelled';
    if (now() >= until) return 'expired';
    const poll = await pollToken(catalogue, codes.deviceCode, send);
    switch (poll.state) {
      case 'approved':
        await keepToken(poll.token);
        return 'approved';
      case 'slow-down':
        // RFC 8628: poll five seconds less often from now on.
        interval += 5;
        break;
      case 'pending':
        break;
      default:
        return poll.state;
    }
  }
}

/** Whether the user's token is taken, and they are subscribed: as `/api/v2/me` says. */
export type Me =
  | { readonly state: 'signed-out' | 'unreachable' }
  | {
      readonly state: 'signed-in';
      readonly handle: string;
      readonly entitled: boolean;
      readonly paidUntil: string | null;
    };

/**
 * Ask the catalogue whose the kept token is.
 * @param catalogue - The catalogue's URL
 * @param send - How to fetch
 * @returns Whose it is, and whether they are subscribed
 */
export async function readMe(catalogue: string, send: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Me> {
  const answer = await relay({ url: new URL('/api/v2/me', catalogue).href, method: 'GET' }, catalogue, send);
  // The request is always one let through.
  /* v8 ignore next */
  if (answer === undefined) return { state: 'unreachable' };
  if ('unreachable' in answer) return { state: 'unreachable' };
  if (answer.status === 401) return { state: 'signed-out' };
  if (answer.status !== 200) return { state: 'unreachable' };
  try {
    const me = JSON.parse(answer.body) as {
      user: { handle: string };
      entitled: boolean;
      subscription: { paidUntil: string | null };
    };
    return {
      state: 'signed-in',
      handle: me.user.handle,
      entitled: me.entitled,
      paidUntil: me.subscription.paidUntil,
    };
  } catch {
    return { state: 'unreachable' };
  }
}
