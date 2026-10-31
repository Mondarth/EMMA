/**
 * Development only: a Vite plugin that brings the EMMA extension, EMMA on Foundry VTT's setup screen, into a local
 * Foundry's setup page without the browser extension. The dev server passes every request on to Foundry; for the setup
 * page itself it adds the EMMA extension's source, served by Vite, to the page Foundry sends back. Each change to the
 * source then reloads the page.
 */
import http from 'node:http';

import type { Plugin } from 'vite';

/** Where the plugin finds Foundry, and what it adds to the setup page. */
export interface InjectSetupOptions {
  /** Foundry's address, such as `http://localhost:30000`. */
  readonly foundry: string;
  /** The module scripts to add to the setup page, by URL. */
  readonly scripts: readonly string[];
}

/**
 * Whether a request is for the setup page.
 * @param url - The request's path and query, as Node gives it
 * @returns `true` for `/setup`, with or without a trailing `/` or a query
 */
export function isSetupPage(url: string): boolean {
  return /^\/setup\/?(\?.*)?$/.test(url);
}

/**
 * Add module scripts to an HTML page, at the end of its head.
 * @param html - The page
 * @param scripts - The scripts' URLs
 * @returns The page with the scripts, or as it was if it has no head
 */
export function addScripts(html: string, scripts: readonly string[]): string {
  const tags = scripts.map(src => `<script type="module" src="${src}"></script>`).join('');
  return html.replace(/<\/head>/i, `${tags}</head>`);
}

/**
 * The plugin.
 * @param options - Where to find Foundry, and what to add to the setup page
 * @returns A Vite plugin, for the dev server only
 */
export function injectSetup(options: InjectSetupOptions): Plugin {
  return {
    name: 'mondarth-emma:inject-setup',
    apply: 'serve',
    configureServer(server) {
      // Added before Vite's own middleware, and so before its proxy, which passes everything else on to Foundry.
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' || !isSetupPage(request.url ?? '')) {
          next();
          return;
        }
        forwardSetupPage(options, request, response, next);
      });
    },
  };
}

/**
 * Ask Foundry for the setup page, as the browser asked for it, and send its answer back with the scripts added. Any
 * other answer, such as a redirect to the login page, goes back as Foundry sent it.
 * @param options - Where to find Foundry, and what to add to the page
 * @param request - The browser's request
 * @param response - The answer to the browser
 * @param next - Passes an error on to Vite
 */
function forwardSetupPage(
  options: InjectSetupOptions,
  request: http.IncomingMessage,
  response: http.ServerResponse,
  next: (error?: unknown) => void,
): void {
  // The browser's own headers, its Host and cookies included, as the proxy keeps them. Foundry is asked for the page
  // uncompressed, so that it can be changed.
  const headers = { ...request.headers, 'accept-encoding': 'identity' };
  const upstream = http.request(new URL(request.url ?? '/setup', options.foundry), { headers }, answer => {
    const isPage = answer.statusCode === 200 && (answer.headers['content-type'] ?? '').startsWith('text/html');
    if (!isPage) {
      response.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(response);
      return;
    }
    const chunks: Buffer[] = [];
    answer.on('data', (chunk: Buffer) => chunks.push(chunk));
    answer.on('end', () => {
      const page = addScripts(Buffer.concat(chunks).toString('utf8'), options.scripts);
      // The page goes back whole, so its length replaces however Foundry sent it.
      const sent: http.OutgoingHttpHeaders = { ...answer.headers, 'content-length': Buffer.byteLength(page) };
      delete sent['transfer-encoding'];
      response.writeHead(200, sent);
      response.end(page);
    });
  });
  upstream.on('error', next);
  upstream.end();
}
