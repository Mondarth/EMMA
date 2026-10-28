/**
 * What the user can do from the extension's popup and options page. Each acts at once and keeps what it changes.
 */
import type { Site } from '../lib/sites';
import { isSetupPage, originOf, patternFor, patternInUse, withoutSite, withSite } from '../lib/sites';
import { injectSetup, readSites, removePermission, requestPermission, syncLoader, writeSites } from './api';

/** The tab the user is on. */
export interface Tab {
  readonly id?: number | undefined;
  readonly url?: string | undefined;
}

/**
 * Activate EMMA on the tab's server, with the user's permission, so that it opens by itself on its setup screen from
 * now on, and open it at once if the tab is a setup screen. The permission is asked for first, while the browser still
 * counts the user's click.
 * @param tab - The tab
 * @returns `activated`; `refused` if the user did not allow it; `unsupported` for a page not on a web server
 */
export async function activate(tab: Tab): Promise<'activated' | 'refused' | 'unsupported'> {
  const server = originOf(tab.url);
  if (server === undefined) return 'unsupported';
  if (!(await requestPermission([patternFor(server, __TARGET__)]))) return 'refused';
  const sites = withSite(await readSites(), server, true);
  await writeSites(sites);
  await syncLoader(sites, __TARGET__);
  if (tab.id !== undefined && isSetupPage(tab.url)) await injectSetup(tab.id);
  return 'activated';
}

/**
 * Open EMMA in the tab this once. The browser allows it for the tab the user clicked the extension's button in,
 * without asking, and remembers nothing.
 * @param tab - The tab
 * @returns `true` if EMMA was brought in
 */
export async function openOnce(tab: Tab): Promise<boolean> {
  if (tab.id === undefined || !isSetupPage(tab.url)) return false;
  await injectSetup(tab.id);
  return true;
}

/**
 * Choose whether EMMA opens by itself on a server's setup screen, or only when the user asks.
 * @param server - The server's origin
 * @param auto - Whether it opens by itself
 * @returns The servers remembered
 */
export async function setAuto(server: string, auto: boolean): Promise<Site[]> {
  const sites = withSite(await readSites(), server, auto);
  await writeSites(sites);
  await syncLoader(sites, __TARGET__);
  return sites;
}

/**
 * Forget a server, and give up the permission to run on it unless another server remembered shares it.
 * @param server - The server's origin
 * @returns The servers still remembered
 */
export async function forget(server: string): Promise<Site[]> {
  const sites = withoutSite(await readSites(), server);
  await writeSites(sites);
  await syncLoader(sites, __TARGET__);
  const pattern = patternFor(server, __TARGET__);
  if (!patternInUse(sites, pattern, __TARGET__)) await removePermission([pattern]);
  return sites;
}
