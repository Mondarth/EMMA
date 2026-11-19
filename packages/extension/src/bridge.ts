/**
 * EMMA's bridge: brought into a tab with EMMA, in a world of its own beside the page, where Foundry's code cannot reach
 * the extension's API. It takes the setup screen's requests to the catalogue to the background script, which asks the
 * catalogue as the signed-in user, and posts the answers back; and asks the background to open the sign-in, on the
 * user's click. It holds no token. It imports nothing, as the browser runs it as a classic script: the names below are
 * those of `@mondarth/emma-core/catalogue-relay`, which a unit test checks.
 */

const PAGE = 'mondarth-emma/page';
const BRIDGE = 'mondarth-emma/bridge';
const REQUEST = 'mondarth-emma/catalogue-request';
const OPEN_SIGN_IN = 'mondarth-emma/open-sign-in';
/** Set once the bridge listens, so that bringing EMMA in again does not add a second. */
const LISTENING = '__mondarthEmmaBridge';

if (Reflect.get(globalThis, LISTENING) !== true) {
  Reflect.set(globalThis, LISTENING, true);
  window.addEventListener('message', event => {
    // Only the page itself, in this frame, on its own origin.
    if (event.source !== window || event.origin !== location.origin) return;
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null || Reflect.get(data, 'source') !== PAGE) return;
    const id: unknown = Reflect.get(data, 'id');
    if (typeof id !== 'string') return;
    if (Reflect.get(data, 'openSignIn') === true) {
      void chrome.runtime.sendMessage({ type: OPEN_SIGN_IN });
      return;
    }
    const request: unknown = Reflect.get(data, 'request');
    void chrome.runtime
      .sendMessage({ type: REQUEST, request })
      .catch(() => undefined)
      .then((answer: unknown) => {
        window.postMessage({ source: BRIDGE, id, answer: answer ?? { unreachable: true } }, location.origin);
      });
  });
}
