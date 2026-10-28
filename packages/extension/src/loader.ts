/**
 * EMMA's loader: a content script the extension registers, with the user's permission, for the servers EMMA opens on
 * by itself. On a page that may be a setup screen it asks the background script to bring EMMA in; the background
 * checks the server again before it does. It imports nothing, as the browser runs it as a classic script.
 */

/** The same as `SETUP_PAGE_MESSAGE` in `browser/api.ts`, which a unit test checks. */
const MESSAGE = 'mondarth-emma/setup-page';

if (/\/setup\/?$/.test(location.pathname)) void chrome.runtime.sendMessage({ type: MESSAGE });
