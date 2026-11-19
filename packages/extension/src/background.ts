/**
 * The extension's background script. It keeps EMMA's loader registered for the servers EMMA opens on by itself, brings
 * EMMA into a page when the loader says it is one of their setup screens, finishes activating a server once the user
 * allows it, and asks the catalogue for the setup screens EMMA was brought into, as the signed-in user.
 */
import { CATALOGUE_REQUEST_MESSAGE, OPEN_SIGN_IN_MESSAGE } from '@mondarth/emma-core/catalogue-relay';

import { finishActivation } from './browser/activation';
import { ACTIVATE_MESSAGE, injectSetup, readSites, SETUP_PAGE_MESSAGE, syncLoader } from './browser/api';
import { mayRelay, relay } from './browser/catalogue';
import { opensOn } from './lib/sites';

/**
 * Register the loader again, as the browser drops registered scripts when the extension updates.
 * @returns Once registered
 */
export async function resync(): Promise<void> {
  await syncLoader(await readSites(), __TARGET__);
}

/**
 * Bring EMMA into the page a message came from, if it is the setup screen of a server EMMA opens on by itself. The
 * server is checked here, against the servers remembered, rather than trusted to the loader.
 * @param message - The message
 * @param sender - Where it came from
 * @returns `true` if EMMA was brought in
 */
export async function onSetupPage(message: unknown, sender: chrome.runtime.MessageSender): Promise<boolean> {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined) return false;
  if (typeof message !== 'object' || message === null || Reflect.get(message, 'type') !== SETUP_PAGE_MESSAGE) {
    return false;
  }
  if (!opensOn(await readSites(), sender.url)) return false;
  await injectSetup(sender.tab.id, sender.url);
  return true;
}

/**
 * Whether a message is the popup's, saying the user allowed an activation: from one of the extension's own pages, not
 * from a tab.
 * @param message - The message
 * @param sender - Where it came from
 * @returns `true` for the popup's message
 */
export function isActivateMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    sender.tab === undefined &&
    typeof message === 'object' &&
    message !== null &&
    Reflect.get(message, 'type') === ACTIVATE_MESSAGE
  );
}

/**
 * The type of a message, if it has one.
 * @param message - The message
 * @returns Its type
 */
const typeOf = (message: unknown): unknown =>
  typeof message === 'object' && message !== null ? Reflect.get(message, 'type') : undefined;

/**
 * Ask the catalogue for a setup screen EMMA was brought into, as the signed-in user: the bridge's message.
 * @param message - The message
 * @param sender - Where it came from
 * @param catalogue - The catalogue's URL, or `null` for a build without one
 * @param send - How to fetch, as a test gives its own
 * @returns The answer; `undefined` for a page, or a request, not let through
 */
export async function onCatalogueRequest(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  catalogue: string | null = __EMMA_CATALOGUE_URL__,
  send?: typeof fetch,
): Promise<unknown> {
  if (!(await mayRelay(sender))) return undefined;
  return relay(Reflect.get(message as object, 'request'), catalogue, send);
}

/**
 * Open the extension's sign-in, its options page, on the user's click on a setup screen EMMA was brought into.
 * @param sender - Where the message came from
 * @returns `true` if it was opened
 */
export async function onOpenSignIn(sender: chrome.runtime.MessageSender): Promise<boolean> {
  if (!(await mayRelay(sender))) return false;
  await chrome.runtime.openOptionsPage();
  return true;
}

chrome.runtime.onInstalled.addListener(() => {
  void resync();
});
chrome.runtime.onStartup.addListener(() => {
  void resync();
});
// Chromium may close the popup when it asks for a server's permission, so the activation is finished here.
chrome.permissions.onAdded.addListener(() => {
  void finishActivation();
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeOf(message) === CATALOGUE_REQUEST_MESSAGE) {
    void onCatalogueRequest(message, sender)
      .catch(() => undefined)
      .then(sendResponse);
    // The answer comes once the catalogue has answered.
    return true;
  }
  if (typeOf(message) === OPEN_SIGN_IN_MESSAGE) {
    void onOpenSignIn(sender).catch(() => false);
    return false;
  }
  if (!isActivateMessage(message, sender)) {
    void onSetupPage(message, sender);
    return false;
  }
  void finishActivation()
    .catch(() => false)
    .then(sendResponse);
  // The answer comes once the activation is finished.
  return true;
});
