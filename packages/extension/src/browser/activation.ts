/**
 * Finishing an activation, in the background script. The popup asks for the server's permission, but Chromium may
 * close the popup when it asks, ending the popup's script before the user answers: the background finishes the
 * activation instead, when the permission is added or when the popup, still open, says it was allowed.
 */
import { isSetupPage, patternFor, withSite } from '../lib/sites';
import { holdsPermission, injectSetup, readSites, syncLoader, takePending, writeSites } from './api';

/** The activations finished so far, one at a time, so that each is taken only once. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Finish the activation waiting on the user's permission, if there is one and the permission is now held: remember the
 * server, register the loader for it, and open EMMA in the tab it was activated from if that is a setup screen.
 * @returns `true` if an activation was finished
 */
export function finishActivation(): Promise<boolean> {
  const finished = queue.then(async () => {
    const pending = await takePending();
    if (pending === undefined) return false;
    if (!(await holdsPermission([patternFor(pending.server, __TARGET__)]))) return false;
    const sites = withSite(await readSites(), pending.server, true);
    await writeSites(sites);
    await syncLoader(sites, __TARGET__);
    if (pending.tabId !== undefined && isSetupPage(pending.url)) {
      // The tab may have moved on, or been closed, while the user answered.
      await injectSetup(pending.tabId).catch(() => undefined);
    }
    return true;
  });
  queue = finished.catch(() => undefined);
  return finished;
}
