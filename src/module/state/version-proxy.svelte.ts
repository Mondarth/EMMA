import type { ProxyMode } from '@module/settings';
import { PROXY_PLACEHOLDER } from '@module/settings';

/**
 * The version lookup proxy chosen in the GM's menu, with their own proxy and its API key, before they are saved.
 */
export class VersionProxyDraft {
  readonly #initial: { readonly mode: ProxyMode; readonly proxy: string; readonly key: string };

  /** Which proxy versions are looked up through: EMMA's, the GM's own, or none. */
  mode: ProxyMode = $state('default');

  /** The GM's own proxy URL template, with `{url}` where the address to fetch goes; kept while another is chosen. */
  proxy: string = $state('');

  /** The API key sent to the GM's own proxy, or blank for none. */
  key: string = $state('');

  /**
   * @param mode - The proxy chosen now
   * @param proxy - The GM's own proxy set now
   * @param key - The API key set now
   */
  constructor(mode: ProxyMode, proxy: string, key: string) {
    this.#initial = { mode, proxy, key };
    this.mode = mode;
    this.proxy = proxy;
    this.key = key;
  }

  /**
   * Whether the choice can be saved: the GM's own proxy, when chosen, needs `{url}` where the address to fetch goes.
   * @returns `true` if it may be saved
   */
  get valid(): boolean {
    return this.mode !== 'own' || this.proxy.includes(PROXY_PLACEHOLDER);
  }

  /**
   * Whether anything differs from what is set now, so that closing would lose a change.
   * @returns `true` if there are changes to save
   */
  get dirty(): boolean {
    return (
      this.mode !== this.#initial.mode ||
      this.proxy.trim() !== this.#initial.proxy.trim() ||
      this.key.trim() !== this.#initial.key.trim()
    );
  }
}
