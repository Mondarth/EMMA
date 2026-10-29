import http from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Commit } from 'semantic-release';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { Plugin, PluginEntry, Step, StepContext, StepName } from '../src/plugins.ts';
import { asPrerelease, changeContext, loadPlugin, onlyCommitsTo } from '../src/plugins.ts';
import type { Repository } from './repository.ts';
import { makeRepository } from './repository.ts';

/**
 * A commit as semantic-release lists it, with only what the wrappers read.
 * @param hash - Its full hash
 * @returns The commit
 */
function commitOf(hash: string): Commit {
  return { hash } as Commit;
}

/**
 * A plugin that keeps what each of its steps is told.
 * @returns The plugin, and the contexts its `analyzeCommits` step was given
 */
function recordingPlugin(): { plugin: Plugin; seen: StepContext[] } {
  const seen: StepContext[] = [];
  const analyzeCommits: Step = (_config, context) => {
    seen.push(context);
    return 'patch';
  };
  return { plugin: { analyzeCommits }, seen };
}

/**
 * The step of a wrapped plugin.
 * @param entry - The wrapped plugin
 * @param name - The step
 * @returns The step
 */
function stepOf(entry: PluginEntry, name: StepName): Step {
  const step = entry[0][name];
  if (step === undefined) throw new Error(`The plugin has no ${name} step`);
  return step;
}

describe('loadPlugin', () => {
  test("loads a named plugin's steps from its module, and names it", async () => {
    const [plugin, config] = await loadPlugin('@semantic-release/commit-analyzer');

    expect(Object.keys(plugin)).toEqual(['analyzeCommits', 'pluginName']);
    expect(plugin.pluginName).toBe('@semantic-release/commit-analyzer');
    expect(config).toEqual({});
  });

  test('keeps its configuration', async () => {
    const [, config] = await loadPlugin(['@semantic-release/release-notes-generator', { preset: 'angular' }]);

    expect(config).toEqual({ preset: 'angular' });
  });

  test('takes a plugin itself, listed on its own or with its configuration', async () => {
    const { plugin } = recordingPlugin();

    expect(await loadPlugin(plugin)).toEqual([plugin, {}]);
    expect(await loadPlugin([plugin, { a: 1 }])).toEqual([plugin, { a: 1 }]);
  });

  test('refuses a module with none of a release’s steps', async () => {
    await expect(loadPlugin('node:path')).rejects.toThrow("node:path has none of a release's steps");
  });
});

describe('changeContext', () => {
  test('wraps only the steps the plugin has, with its configuration, passing on what else it is given', async () => {
    const { plugin, seen } = recordingPlugin();
    const step = vi.fn<Step>(plugin.analyzeCommits);
    const wrapped = changeContext([{ analyzeCommits: step }, { a: 1 }], 'changed', context => ({ ...context, b: 2 }));

    expect(Object.keys(wrapped[0])).toEqual(['analyzeCommits', 'pluginName']);
    expect(wrapped[1]).toEqual({ a: 1 });
    expect(await stepOf(wrapped, 'analyzeCommits')({ a: 1 }, { cwd: '/repo' }, 'more')).toBe('patch');
    expect(step).toHaveBeenCalledWith({ a: 1 }, { cwd: '/repo', b: 2 }, 'more');
    expect(seen).toEqual([{ cwd: '/repo', b: 2 }]);
  });

  test('names the plugin, and each of its steps, for the release’s log', () => {
    const named = changeContext(
      [{ ...recordingPlugin().plugin, pluginName: '@semantic-release/github' }, {}],
      'as a pre-release',
      context => context,
    );
    const unnamed = changeContext([recordingPlugin().plugin, {}], 'changed', context => context);

    expect(named[0].pluginName).toBe('@semantic-release/github, as a pre-release');
    expect(stepOf(named, 'analyzeCommits')).toHaveProperty('pluginName', '@semantic-release/github, as a pre-release');
    expect(unnamed[0].pluginName).toBe('Inline plugin, changed');
  });

  test('keeps the name it gives a step, as semantic-release names a step only if it has no name', () => {
    const step = stepOf(
      changeContext([recordingPlugin().plugin, {}], 'changed', context => context),
      'analyzeCommits',
    );

    expect(Reflect.defineProperty(step, 'pluginName', { value: 'Inline plugin' })).toBe(false);
    expect(step).toHaveProperty('pluginName', 'Inline plugin, changed');
  });
});

describe('onlyCommitsTo', () => {
  let repository: Repository;
  let commits: Record<'start' | 'module' | 'core' | 'extension' | 'both' | 'root', string>;

  beforeEach(() => {
    repository = makeRepository();
    commits = {
      start: repository.commit('chore(repo): start', {
        'packages/module/index.ts': '1',
        'packages/core/index.ts': '1',
      }),
      module: repository.commit('fix(module): one', { 'packages/module/index.ts': '2' }),
      core: repository.commit('fix(core): two', { 'packages/core/index.ts': '2' }),
      extension: repository.commit('fix(extension): three', { 'packages/extension/index.ts': '1' }),
      both: repository.commit('fix(repo): four', { 'packages/extension/index.ts': '2', 'packages/core/index.ts': '3' }),
      root: repository.commit('fix(repo): five', { 'README.md': 'EMMA' }),
    };
  });

  afterEach(() => {
    repository.remove();
    vi.restoreAllMocks();
  });

  test('tells the plugin only of the commits that change the folders', async () => {
    const { plugin, seen } = recordingPlugin();
    const log = vi.fn();
    const wrapped = await onlyCommitsTo(['packages/module', 'packages/core'], plugin);
    const listed = Object.values(commits).reverse().map(commitOf);

    await stepOf(wrapped, 'analyzeCommits')({}, { cwd: repository.root, commits: listed, logger: { log } });

    expect(seen[0]?.commits).toEqual([commits.both, commits.core, commits.module, commits.start].map(commitOf));
    expect(log).toHaveBeenCalledWith('%d of %d commits change %s', 4, 6, 'packages/module, packages/core');
    expect(wrapped[0].pluginName).toBe('Inline plugin, on packages/module, packages/core');
  });

  test('reads the commits from the folder semantic-release runs in, if it is given none', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(repository.root);
    const { plugin, seen } = recordingPlugin();
    const wrapped = await onlyCommitsTo(['packages/extension'], plugin);

    await stepOf(wrapped, 'analyzeCommits')({}, { commits: [commits.extension, commits.module].map(commitOf) });

    expect(seen[0]?.commits).toEqual([commitOf(commits.extension)]);
  });

  test('leaves a step that is told of no commits as it is', async () => {
    const { plugin, seen } = recordingPlugin();
    const wrapped = await onlyCommitsTo(['packages/module'], plugin);

    await stepOf(wrapped, 'analyzeCommits')({}, { cwd: '/no/such/folder' });

    expect(seen).toEqual([{ cwd: '/no/such/folder' }]);
  });

  test('refuses no folders, or a folder not named from the root', async () => {
    const { plugin } = recordingPlugin();

    await expect(onlyCommitsTo([], plugin)).rejects.toThrow('onlyCommitsTo needs at least one folder');
    await expect(onlyCommitsTo(['packages/module/'], plugin)).rejects.toThrow('is not a folder named');
  });
});

describe('asPrerelease', () => {
  test('tells the plugin the release is a pre-release, not on the main release branch', async () => {
    const { plugin, seen } = recordingPlugin();
    const wrapped = await asPrerelease(plugin);

    await stepOf(wrapped, 'analyzeCommits')({}, { branch: { name: 'main', type: 'release', main: true } });

    expect(seen[0]?.branch).toEqual({ name: 'main', type: 'release', main: false, prerelease: true });
  });

  test('leaves a step that is told of no branch as it is', async () => {
    const { plugin, seen } = recordingPlugin();

    await stepOf(await asPrerelease(plugin), 'analyzeCommits')({}, { cwd: '/repo' });

    expect(seen).toEqual([{ cwd: '/repo' }]);
  });

  describe('with @semantic-release/github', () => {
    let server: http.Server;
    let releases: Record<string, unknown>[];
    let apiUrl: string;

    beforeEach(async () => {
      releases = [];
      // Answers as GitHub's API does the requests the plugin makes to publish a release with no files attached.
      server = http.createServer((request, response) => {
        let body = '';
        request.on('data', (chunk: Buffer) => (body += chunk.toString()));
        request.on('end', () => {
          response.setHeader('content-type', 'application/json');
          if (request.method === 'POST' && request.url === '/repos/Mondarth/EMMA/releases') {
            releases.push(JSON.parse(body) as Record<string, unknown>);
            response.end(JSON.stringify({ html_url: 'https://github.com/Mondarth/EMMA/releases/1', id: 1 }));
          } else if (request.method === 'GET' && request.url === '/repos/Mondarth/EMMA') {
            response.end(
              JSON.stringify({
                full_name: 'Mondarth/EMMA',
                clone_url: 'https://github.com/Mondarth/EMMA.git',
                permissions: { push: true },
              }),
            );
          } else {
            response.statusCode = 404;
            response.end('{}');
          }
        });
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(async () => {
      await new Promise(resolve => server.close(resolve));
    });

    /**
     * Publish a release from `main` with the plugin.
     * @param entry - The plugin, wrapped or not
     */
    async function publishWith(entry: PluginEntry): Promise<void> {
      const log = vi.fn();
      // The plugin logs with each of the logger's methods.
      const logger = { log, error: log, success: log, warn: log };
      await stepOf(entry, 'publish')(
        { githubApiUrl: apiUrl },
        {
          cwd: process.cwd(),
          env: { GITHUB_TOKEN: 'token' },
          options: { repositoryUrl: 'https://github.com/Mondarth/EMMA.git' },
          branch: { name: 'main', type: 'release', main: true },
          nextRelease: { gitTag: 'extension-v0.1.1', name: 'extension-v0.1.1', version: '0.1.1', notes: 'Notes' },
          logger,
        },
      );
    }

    test('publishes a release from main as the latest, unwrapped', async () => {
      await publishWith(await loadPlugin('@semantic-release/github'));

      expect(releases).toEqual([expect.objectContaining({ prerelease: false, make_latest: 'true' })]);
    });

    test('publishes it as a pre-release, never the latest, wrapped', async () => {
      await publishWith(await asPrerelease('@semantic-release/github'));

      expect(releases).toEqual([
        expect.objectContaining({ tag_name: 'extension-v0.1.1', prerelease: true, make_latest: 'false' }),
      ]);
    });
  });
});
