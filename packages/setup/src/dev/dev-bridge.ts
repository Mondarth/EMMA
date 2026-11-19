/**
 * Development only: a stand-in for the browser extension's bridge, which the setup screen's dev server adds to the
 * setup page, as the extension is not there (see `scripts/dev/inject-setup.ts`). It answers the page's posts as the
 * bridge does (`@mondarth/emma-core/catalogue-relay`), passing each request to the dev server, which asks the
 * development catalogue with the developer's token (`scripts/dev/catalogue-relay.ts`). Never in a build.
 */
import type { BridgePost, PagePost, RelayAnswer } from '@mondarth/emma-core/catalogue-relay';
import { BRIDGE_SOURCE, PAGE_SOURCE } from '@mondarth/emma-core/catalogue-relay';

/** Where the bridge listens and answers: the window, as a test gives its own. */
export type BridgeWindow = Pick<Window, 'postMessage' | 'addEventListener' | 'alert'> & {
  readonly location: { readonly origin: string };
};

/**
 * Answer the page's posts.
 * @param target - The window
 * @param endpoint - The dev server's relay, such as `/emma-setup-dev/catalogue`
 * @param send - How to fetch
 */
export function startDevBridge(
  target: BridgeWindow,
  endpoint: string,
  send: typeof fetch = globalThis.fetch.bind(globalThis),
): void {
  target.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== target) return;
    const data = event.data as Partial<PagePost> | null;
    if (data?.source !== PAGE_SOURCE || typeof data.id !== 'string') return;
    const { id } = data;
    const request: unknown = Reflect.get(data, 'request');
    if ('openSignIn' in data) {
      target.alert('The browser extension is not here: sign in with pnpm dev:sign-in, then refresh EMMA.');
      return;
    }
    void send(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
      .then(response => response.json() as Promise<RelayAnswer>)
      .catch((): RelayAnswer => ({ unreachable: true }))
      .then(answer => {
        target.postMessage({ source: BRIDGE_SOURCE, id, answer } satisfies BridgePost, target.location.origin);
      });
  });
}
