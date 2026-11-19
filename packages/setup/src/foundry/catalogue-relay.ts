/**
 * How the setup screen asks EMMA's catalogue: as the user signed in to the browser extension, through the extension,
 * which holds their token where Foundry's page cannot read it (see `@mondarth/emma-core/catalogue-relay`). The page
 * posts each request to its own window, and the extension's bridge, in the same tab, posts the answer back.
 */
import type { Account, BridgePost, PagePost, RelayAnswer } from '@mondarth/emma-core/catalogue-relay';
import { accountOf, BRIDGE_SOURCE, ME_PATH, PAGE_SOURCE } from '@mondarth/emma-core/catalogue-relay';

/**
 * The catalogue's URL this build has, or `null` for a build without one, as for development, CI and tests.
 * @returns The URL
 */
export function builtCatalogue(): string | null {
  return __EMMA_CATALOGUE_URL__;
}

/** How long a request waits for the extension's answer: a lookup the catalogue must fetch for may take a while. */
export const RELAY_TIMEOUT_MS = 60_000;

/** The statuses whose answers have no body, which `Response` refuses one. */
const NO_BODY = new Set([101, 204, 205, 304]);

/** An account that keeps the user from the catalogue: they sign in, or renew their subscription. */
export type AccountProblem =
  | { readonly reason: 'signed-out' }
  | { readonly reason: 'lapsed'; readonly paidUntil: string | null; readonly renew: string };

/** Thrown when the user must sign in, or renew, before EMMA asks the catalogue for them. */
export class AccountRequired extends Error {
  readonly problem: AccountProblem;

  /**
   * @param problem - What the user must do
   */
  constructor(problem: AccountProblem) {
    super(`EMMA's catalogue needs the user to ${problem.reason === 'signed-out' ? 'sign in' : 'renew'}`);
    this.name = 'AccountRequired';
    this.problem = problem;
  }
}

/** Where the page posts, and hears from: the window, as a test gives its own. */
export type RelayWindow = Pick<Window, 'postMessage' | 'addEventListener' | 'removeEventListener'> & {
  readonly location: { readonly origin: string };
};

let posted = 0;

/**
 * An id for a post, unique to the page: `crypto.randomUUID` is only on secure pages, and Foundry may be served on
 * plain http.
 * @returns The id
 */
function nextId(): string {
  posted += 1;
  return `${String(posted)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Post to the extension's bridge, and wait for its answer.
 * @param target - The window
 * @param post - What to post, but for who posts it and its id
 * @param timeout - How long to wait
 * @returns The answer, or `unreachable` if none came in time
 */
function ask(
  target: RelayWindow,
  post: Omit<Extract<PagePost, { request: unknown }>, 'source' | 'id'>,
  timeout = RELAY_TIMEOUT_MS,
): Promise<RelayAnswer> {
  const id = nextId();
  return new Promise(resolve => {
    const done = (answer: RelayAnswer) => {
      clearTimeout(timer);
      target.removeEventListener('message', heard);
      resolve(answer);
    };
    const heard = (event: MessageEvent) => {
      if (event.source !== target) return;
      const data = event.data as Partial<BridgePost> | null;
      if (data?.source === BRIDGE_SOURCE && data.id === id && data.answer !== undefined) done(data.answer);
    };
    const timer = setTimeout(() => {
      done({ unreachable: true });
    }, timeout);
    target.addEventListener('message', heard);
    target.postMessage({ source: PAGE_SOURCE, id, ...post } satisfies PagePost, target.location.origin);
  });
}

/**
 * A `fetch` that asks the catalogue through the extension, for the resolver's catalogue source. The headers the page
 * gives are passed on as the extension allows; no key or token goes from the page.
 * @param target - The window, as a test gives its own
 * @param timeout - How long each request waits for an answer
 * @returns The `fetch`, which rejects, as a network failure does, when no answer comes
 */
export function relayFetch(target: RelayWindow = window, timeout = RELAY_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const method = request.method === 'POST' ? 'POST' : 'GET';
    const body = method === 'POST' ? await request.text() : undefined;
    const answer = await ask(
      target,
      {
        request: {
          url: request.url,
          method,
          headers: Object.fromEntries([...request.headers].map(([name, value]) => [name.toLowerCase(), value])),
          ...(body !== undefined && { body }),
        },
      },
      timeout,
    );
    if ('unreachable' in answer) throw new TypeError("EMMA's catalogue could not be reached");
    return new Response(NO_BODY.has(answer.status) ? null : answer.body, {
      status: answer.status,
      headers: answer.headers,
    });
  };
}

/**
 * Whether the user may use the catalogue: whom the extension holds a token of, and whether they are subscribed.
 * @param catalogue - The catalogue's URL
 * @param target - The window, as a test gives its own
 * @param timeout - How long to wait for an answer
 * @returns The account
 */
export async function readAccount(
  catalogue: string,
  target: RelayWindow = window,
  timeout = RELAY_TIMEOUT_MS,
): Promise<Account> {
  return accountOf(
    await ask(target, { request: { url: new URL(ME_PATH, catalogue).href, method: 'GET', headers: {} } }, timeout),
  );
}

/**
 * Make sure the user may use the catalogue before EMMA asks it for them. A catalogue that cannot be reached is let be:
 * asking it finds that too, and says so as it always has.
 * @param catalogue - The catalogue's URL
 * @param read - How the account is read, as a test gives its own
 * @throws {AccountRequired} if the user must sign in, or renew
 */
export async function requireAccount(
  catalogue: string,
  read: (catalogue: string) => Promise<Account> = readAccount,
): Promise<void> {
  const account = await read(catalogue);
  if (account.state === 'signed-out') throw new AccountRequired({ reason: 'signed-out' });
  if (account.state === 'lapsed') {
    throw new AccountRequired({
      reason: 'lapsed',
      paidUntil: account.paidUntil,
      renew: new URL('/subscription', catalogue).href,
    });
  }
}

/**
 * Ask the extension to open its sign-in, on the user's click.
 * @param target - The window, as a test gives its own
 */
export function openSignIn(target: RelayWindow = window): void {
  target.postMessage(
    { source: PAGE_SOURCE, id: nextId(), openSignIn: true } satisfies PagePost,
    target.location.origin,
  );
}
