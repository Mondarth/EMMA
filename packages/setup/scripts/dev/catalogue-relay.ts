/**
 * Development only: a Vite plugin that stands in for the browser extension's background script on the setup screen's
 * dev server. The page's dev bridge (`src/dev/dev-bridge.ts`) posts each request EMMA makes of the catalogue here, and
 * the dev server asks the development catalogue with the token `pnpm dev:sign-in` kept, letting through what the
 * extension lets through (`parseRelayRequest`), so that the token stays here, as it stays in the extension.
 */
import type http from 'node:http';

import type { RelayAnswer } from '@mondarth/emma-core/catalogue-relay';
import { ANSWER_HEADERS, parseRelayRequest } from '@mondarth/emma-core/catalogue-relay';
import type { Plugin } from 'vite';

import { readDevToken } from './catalogue-token.ts';

/** Where, under the dev server's own path, the page posts its requests. */
export const RELAY_PATH = 'catalogue';

/** What the plugin is given. */
export interface RelayCatalogueOptions {
  /** The repository's root, where the token is kept. */
  readonly root: string;
  /** The development catalogue's URL. */
  readonly catalogue: string;
  /** The dev server's own path, such as `/emma-setup-dev/`. */
  readonly base: string;
  readonly fetch?: typeof fetch;
}

/** What is answered, without asking, while no one is signed in: as the catalogue answers a token it does not take. */
const SIGNED_OUT: RelayAnswer = {
  status: 401,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'unauthorised', message: 'Run pnpm dev:sign-in', requestId: 'dev-server' } }),
};

/**
 * Ask the catalogue as the developer, if the request is one the extension lets through.
 * @param given - The request, as the page posted it
 * @param catalogue - The catalogue's URL
 * @param token - The token, if one is kept
 * @param send - How to fetch
 * @returns The answer; `undefined` for a request not let through
 */
export async function relayed(
  given: unknown,
  catalogue: string,
  token: string | undefined,
  send: typeof fetch,
): Promise<RelayAnswer | undefined> {
  const request = parseRelayRequest(given, catalogue);
  if (request === undefined) return undefined;
  if (token === undefined) return SIGNED_OUT;
  try {
    const response = await send(request.url, {
      method: request.method,
      headers: { ...request.headers, authorization: `Bearer ${token}` },
      ...(request.body !== undefined && { body: request.body }),
      redirect: 'error',
    });
    const headers: Record<string, string> = {};
    for (const name of ANSWER_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    return { status: response.status, headers, body: await response.text() };
  } catch {
    return { unreachable: true };
  }
}

/**
 * Read a request's body.
 * @param request - The request
 * @returns Its body, as text
 */
function bodyOf(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

/**
 * The plugin.
 * @param options - The catalogue, and where the token is kept
 * @returns A Vite plugin, for the dev server only
 */
export function relayCatalogue(options: RelayCatalogueOptions): Plugin {
  const { root, catalogue, base, fetch: send = globalThis.fetch.bind(globalThis) } = options;
  return {
    name: 'mondarth-emma:relay-catalogue',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(`${base}${RELAY_PATH}`, (request, response) => {
        void (async () => {
          // A JSON post alone, which another site's page cannot make here without the preflight Vite does not answer.
          if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
            response.statusCode = 405;
            response.end();
            return;
          }
          let given: unknown;
          try {
            given = JSON.parse(await bodyOf(request));
          } catch {
            given = undefined;
          }
          // The token is read for each request, so that signing in or out takes effect at once.
          const answer = await relayed(given, catalogue, readDevToken(root, catalogue), send);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(answer ?? { unreachable: true }));
        })();
      });
    },
  };
}
