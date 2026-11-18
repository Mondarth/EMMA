/**
 * Development only: `pnpm dev:sign-in` signs the developer in to the development catalogue named in
 * `EMMA_DEV_CATALOGUE_URL`, as EMMA's browser extension signs its user in (OAuth 2's device authorization grant), and
 * keeps the token for the setup screen's dev server (see `catalogue-token.ts`). `pnpm dev:sign-out` forgets it.
 */
import { DEV_CATALOGUE_VARIABLE } from '@mondarth/emma-core/default-catalogue-define';

import { forgetDevToken, writeDevToken } from './catalogue-token.ts';

/** How the sign-in ended. */
export type DevSignInEnd = 'approved' | 'denied' | 'expired' | 'failed';

/** What the sign-in is given. */
export interface DevSignInOptions {
  /** The repository's root, where the token is kept. */
  readonly root: string;
  readonly catalogue: string;
  readonly fetch?: typeof fetch;
  /** Says something to the developer. */
  readonly log?: (line: string) => void;
  readonly wait?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/**
 * Post JSON to the catalogue, and read its answer.
 * @param send - How to fetch
 * @param url - Where
 * @param body - What
 * @returns The answer's JSON, and whether it was a success
 */
async function post(
  send: typeof fetch,
  url: string,
  body: unknown,
): Promise<{ ok: boolean; read: Record<string, unknown> }> {
  const response = await send(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, read: (await response.json()) as Record<string, unknown> };
}

/**
 * Sign the developer in: ask for codes, say where to approve them, and poll until they do, keeping the token.
 * @param options - What the sign-in is given
 * @returns How it ended
 */
export async function devSignIn(options: DevSignInOptions): Promise<DevSignInEnd> {
  const {
    root,
    catalogue,
    fetch: send = globalThis.fetch.bind(globalThis),
    log = line => {
      console.info(line);
    },
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = Date.now,
  } = options;
  const client = { client_id: 'emma-extension' };
  let codes: Record<string, unknown>;
  try {
    const asked = await post(send, new URL('/auth/device/code', catalogue).href, client);
    if (!asked.ok) throw new Error('refused');
    codes = asked.read;
  } catch {
    log(`The catalogue at ${catalogue} gave no codes: is it running, at 0.10.1 or later?`);
    return 'failed';
  }
  const { device_code: deviceCode, user_code: userCode, verification_uri_complete: page } = codes;
  log(`Open ${String(page)} and approve code ${String(userCode)}, signed in as a subscriber or an admin.`);
  const until = now() + (typeof codes['expires_in'] === 'number' ? codes['expires_in'] : 600) * 1000;
  let interval = typeof codes['interval'] === 'number' ? codes['interval'] : 5;
  for (;;) {
    await wait(interval * 1000);
    if (now() >= until) {
      log('The code expired. Run pnpm dev:sign-in again.');
      return 'expired';
    }
    let read: Record<string, unknown>;
    try {
      ({ read } = await post(send, new URL('/auth/device/token', catalogue).href, {
        ...client,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
      }));
    } catch {
      log('The catalogue could not be asked for the token.');
      return 'failed';
    }
    const token = read['access_token'];
    if (typeof token === 'string' && token !== '') {
      writeDevToken(root, catalogue, token);
      log("Signed in: the setup screen's dev server asks the catalogue as you.");
      return 'approved';
    }
    if (read['error'] === 'slow_down') interval += 5;
    else if (read['error'] === 'access_denied') {
      log('Denied.');
      return 'denied';
    } else if (read['error'] !== 'authorization_pending') {
      log(`The catalogue refused: ${String(read['error'])}`);
      return 'failed';
    }
  }
}

/**
 * Run as `pnpm dev:sign-in`, or `pnpm dev:sign-out` (`--sign-out`).
 * @param root - The repository's root
 * @param env - The environment
 * @param argv - The arguments
 * @returns The exit code
 */
export async function main(
  root: string,
  env: Readonly<Record<string, string | undefined>>,
  argv: readonly string[],
): Promise<number> {
  if (argv.includes('--sign-out')) {
    forgetDevToken(root);
    console.info('Signed out: the token is forgotten.');
    return 0;
  }
  const catalogue = env[DEV_CATALOGUE_VARIABLE];
  if (catalogue === undefined || catalogue === '') {
    console.error(`Set ${DEV_CATALOGUE_VARIABLE} to the development catalogue, such as http://localhost:5173/`);
    return 1;
  }
  return (await devSignIn({ root, catalogue })) === 'approved' ? 0 : 1;
}

// Run as a command alone, not when the tests import it.
/* v8 ignore next 3 */
if (import.meta.main) {
  process.exitCode = await main(process.cwd(), process.env, process.argv.slice(2));
}
