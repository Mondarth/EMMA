import { PROXY_PLACEHOLDER } from '@module/settings';

/**
 * The version lookup proxy and its API key being set in the GM's menu, before they are saved.
 */
export class VersionProxyDraft {
  readonly #initial: { readonly proxy: string; readonly key: string };

  /** The proxy URL template, with `{url}` where the address to fetch goes, or blank for none. */
  proxy: string = $state('');

  /** The API key sent to the proxy, or blank for none. */
  key: string = $state('');

  /**
   * @param proxy - The proxy set now
   * @param key - The API key set now
   */
  constructor(proxy: string, key: string) {
    this.#initial = { proxy, key };
    this.proxy = proxy;
    this.key = key;
  }

  /**
   * Whether the proxy can be used: blank for none, or with `{url}` where the address to fetch goes.
   * @returns `true` if it may be saved
   */
  get valid(): boolean {
    const proxy = this.proxy.trim();
    return proxy === '' || proxy.includes(PROXY_PLACEHOLDER);
  }

  /**
   * Whether anything differs from what is set now, so that closing would lose a change.
   * @returns `true` if there are changes to save
   */
  get dirty(): boolean {
    return this.proxy.trim() !== this.#initial.proxy.trim() || this.key.trim() !== this.#initial.key.trim();
  }
}
