// @vitest-environment node
/**
 * The dev server's plugin, between a browser and a stand-in for Foundry VTT.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { addScripts, injectSetup, isSetupPage } from '../../../scripts/dev/inject-setup';

const SCRIPTS = ['/dev/@vite/client', '/dev/src/index.ts'];
const PAGE = '<html><head><title>Foundry</title></head><body></body></html>';

/** The servers a test started, closed after it. */
const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

/**
 * Start a server on a free port.
 * @param handler - What it does with each request
 * @returns Its address
 */
async function serve(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

type Middleware = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * Start the dev server's middleware, as Vite would, in front of Foundry.
 * @param foundry - Foundry's address
 * @param next - What Vite would do with a request the plugin passes on
 * @returns The dev server's address
 */
async function devServer(foundry: string, next: (error?: unknown) => void = vi.fn()): Promise<string> {
  let middleware: Middleware | undefined;
  const plugin = injectSetup({ foundry, scripts: SCRIPTS });
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({ middlewares: { use: (handler: Middleware) => (middleware = handler) } } as unknown as ViteDevServer);
  return serve((request, response) => {
    middleware?.(request, response, error => {
      next(error);
      response.statusCode = error === undefined ? 404 : 500;
      response.end('passed on');
    });
  });
}

describe('the setup page', () => {
  test('is /setup, with or without a trailing slash or a query', () => {
    expect(isSetupPage('/setup')).toBe(true);
    expect(isSetupPage('/setup/')).toBe(true);
    expect(isSetupPage('/setup?tab=worlds')).toBe(true);
    expect(isSetupPage('/setupx')).toBe(false);
    expect(isSetupPage('/setup/other')).toBe(false);
    expect(isSetupPage('/join')).toBe(false);
  });

  test('gets the scripts at the end of its head', () => {
    expect(addScripts(PAGE, SCRIPTS)).toBe(
      '<html><head><title>Foundry</title><script type="module" src="/dev/@vite/client"></script>' +
        '<script type="module" src="/dev/src/index.ts"></script></head><body></body></html>',
    );
    expect(addScripts('<p>no head</p>', SCRIPTS)).toBe('<p>no head</p>');
  });
});

describe('the plugin', () => {
  test('serves only the dev server', () => {
    expect(injectSetup({ foundry: 'http://localhost:30000', scripts: [] }).apply).toBe('serve');
  });

  test("adds the scripts to Foundry's setup page, asked for as the browser asked", async () => {
    const asked: http.IncomingHttpHeaders[] = [];
    const foundry = await serve((request, response) => {
      asked.push(request.headers);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'session=1' });
      response.end(PAGE);
    });
    const dev = await devServer(foundry);

    const answer = await fetch(`${dev}/setup`, { headers: { cookie: 'session=1', 'accept-encoding': 'gzip' } });
    const page = await answer.text();

    expect(answer.status).toBe(200);
    expect(page).toBe(addScripts(PAGE, SCRIPTS));
    expect(answer.headers.get('content-length')).toBe(String(Buffer.byteLength(page)));
    expect(answer.headers.get('set-cookie')).toBe('session=1');
    expect(asked[0]?.cookie).toBe('session=1');
    expect(asked[0]?.['accept-encoding']).toBe('identity');
  });

  test("passes Foundry's other answers back as they are", async () => {
    const foundry = await serve((_request, response) => {
      response.writeHead(302, { location: '/auth' });
      response.end('Found');
    });
    const dev = await devServer(foundry);

    const answer = await fetch(`${dev}/setup`, { redirect: 'manual' });

    expect(answer.status).toBe(302);
    expect(answer.headers.get('location')).toBe('/auth');
    expect(await answer.text()).toBe('Found');
  });

  test('passes on any other request, and the setup page when Foundry cannot be reached', async () => {
    const next = vi.fn();
    const dev = await devServer('http://127.0.0.1:1', next);

    expect((await fetch(`${dev}/join`)).status).toBe(404);
    expect((await fetch(`${dev}/setup`, { method: 'HEAD' })).status).toBe(404);
    expect(next).toHaveBeenNthCalledWith(1, undefined);

    expect((await fetch(`${dev}/setup`)).status).toBe(500);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'ECONNREFUSED' }));
  });
});
