/**
 * Development only: `pnpm dev:extension` builds the browser extension with the development catalogue named in
 * `EMMA_DEV_CATALOGUE_URL`, and the development accounts named in `EMMA_DEV_ACCOUNTS_URL`, zips each browser's build, and serves the zips from this machine, for a browser on another
 * to load: unpacked, in Chromium, or as a temporary add-on, in Firefox (see docs/developers/setup.md). The page it
 * serves rebuilds on request. It only builds, zips and serves, as the release's packaging script does, so it is left
 * out of the unit tests' coverage.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { DEV_ACCOUNTS_VARIABLE, DEV_CATALOGUE_VARIABLE } from '@mondarth/emma-core/default-catalogue-define';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const EXTENSION = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(EXTENSION, 'releases', 'dev');
const PORT = Number(process.env['EMMA_DEV_EXTENSION_PORT'] ?? 31004);
const TARGETS = ['chromium', 'firefox'] as const;
const CATALOGUE = process.env[DEV_CATALOGUE_VARIABLE] || undefined;
const ACCOUNTS = process.env[DEV_ACCOUNTS_VARIABLE] || undefined;

let built: { at: Date; error?: string } | undefined;

/**
 * The zip of a browser's build.
 * @param target - The browser
 * @returns The zip's file name
 */
const zipOf = (target: (typeof TARGETS)[number]) => `emma-extension-${target}-dev.zip`;

/** Build the extension, with the setup screen's script it takes in, and zip each browser's build. */
function build(): void {
  try {
    execFileSync('pnpm', ['--filter', '@mondarth/emma-extension...', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    fs.mkdirSync(OUT, { recursive: true });
    for (const target of TARGETS) {
      const archive = path.join(OUT, zipOf(target));
      fs.rmSync(archive, { force: true });
      execFileSync('zip', ['-q', '-r', '-D', archive, '.'], { cwd: path.join(EXTENSION, 'dist', target) });
    }
    built = { at: new Date() };
  } catch (error) {
    built = { at: new Date(), error: String(error) };
  }
}

/**
 * The page: what was built, from what, the zips, how to load them, and rebuilding.
 * @returns Its HTML
 */
function page(): string {
  const links = TARGETS.map(target => `<li><a href="/${zipOf(target)}">${zipOf(target)}</a></li>`).join('');
  const state =
    built === undefined
      ? 'Not built yet.'
      : built.error === undefined
        ? `Built ${built.at.toLocaleString()}.`
        : `<strong>The build failed</strong> (${built.at.toLocaleString()}): see the terminal.`;
  return `<!doctype html><meta charset="utf-8"><title>EMMA extension, development</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}code{font-size:.95em}</style>
<h1>EMMA extension, development build</h1>
<p>${state} Catalogue: <code>${CATALOGUE ?? 'none (set ' + DEV_CATALOGUE_VARIABLE + ')'}</code>. Signs in at:
<code>${ACCOUNTS ?? 'the catalogue (set ' + DEV_ACCOUNTS_VARIABLE + ')'}</code>.</p>
<ul>${links}</ul>
<form method="post" action="/rebuild"><button>Rebuild from the source</button></form>
<h2>Loading it</h2>
<ul>
<li><strong>Chromium</strong>: unzip into a folder you keep, then <code>chrome://extensions</code>, Developer mode,
<strong>Load unpacked</strong>. After a rebuild, unzip over the same folder and choose the card's reload button.</li>
<li><strong>Firefox</strong>: <code>about:debugging#/runtime/this-firefox</code>, <strong>Load Temporary
Add-on…</strong>, and choose the zip. After a rebuild, choose <strong>Reload</strong>, or load the new zip.</li>
</ul>
<p>Then activate EMMA on the Foundry server's setup screen, and sign in from the extension's options.</p>`;
}

const server = http.createServer((request, response) => {
  const url = request.url ?? '/';
  if (request.method === 'POST' && url === '/rebuild') {
    build();
    response.writeHead(303, { location: '/' });
    response.end();
    return;
  }
  const target = TARGETS.find(name => url === `/${zipOf(name)}`);
  if (request.method === 'GET' && target !== undefined) {
    const archive = path.join(OUT, zipOf(target));
    if (!fs.existsSync(archive)) {
      response.writeHead(404);
      response.end('Not built');
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${zipOf(target)}"`,
    });
    fs.createReadStream(archive).pipe(response);
    return;
  }
  if (request.method === 'GET' && url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page());
    return;
  }
  response.writeHead(404);
  response.end();
});

if (CATALOGUE === undefined) console.warn(`${DEV_CATALOGUE_VARIABLE} is not set: the build has no catalogue.`);
if (ACCOUNTS === undefined) console.warn(`${DEV_ACCOUNTS_VARIABLE} is not set: the build signs in at the catalogue.`);
build();
server.listen(PORT, () => {
  console.info(`EMMA's development extension: http://${os.hostname()}:${String(PORT)}/`);
});
