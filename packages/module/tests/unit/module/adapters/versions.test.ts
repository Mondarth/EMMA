import type * as Resolver from '@mondarth/fvtt-resolver';
import { describe, expect, test, vi } from 'vitest';

import type { SetupSolve } from '@module/adapters/report';
import { AVAILABILITY } from '@mondarth/fvtt-resolver';
import { createInstalledJudge, createVersionJudge, incompatibleModules } from '@module/adapters/versions';
import type { FoundryMockOptions, ModuleMockData } from '../../mocks/foundry';
import { installFoundryMocks } from '../../mocks/foundry';
import { setIgnoredNotes } from '@module/state/hypothetical-ignored.svelte';

// Each universe a check is given, recorded: a judgement must give only what the check reads.
const checked = vi.hoisted(() => ({ universes: [] as { releases: readonly unknown[] }[] }));
vi.mock('@mondarth/fvtt-resolver', async importOriginal => {
  const actual = await importOriginal<typeof Resolver>();
  return {
    ...actual,
    check: (...args: Parameters<typeof actual.check>) => {
      checked.universes.push(args[0]);
      return actual.check(...args);
    },
  };
});

const CATALOGUE = { url: 'https://catalogue.test/', key: 'cat-k3y' };
const LOOKUP = 'https://catalogue.test/api/v2/lookup';

/** Availability codes, as Foundry numbers them. */
const VERIFIED = 1;
const MISSING_DEPENDENCY = 6;
const REQUIRES_CORE_UPGRADE_UNKNOWN = 10;

/** Nothing chosen. */
const NONE = { modules: new Map<string, string>() };

/**
 * An installed module, active, verified with the core in use, whose manifest URL gives its newest release.
 * @param id - Its ID
 * @param data - The rest of the module
 * @returns The module's mock data
 */
function installedModule(id: string, data: ModuleMockData = {}): ModuleMockData {
  return {
    active: true,
    links: { manifest: `https://files.test/${id}/latest/module.json` },
    compatibility: { minimum: '14', verified: '14' },
    ...data,
  };
}

/**
 * A release as the catalogue gives it, loaded from a manifest of its own.
 * @param id - The package's ID
 * @param version - Its version
 * @param more - What else differs
 * @param type - The package's type
 * @returns The release, with its package
 */
function held(id: string, version: string, more: Record<string, unknown> = {}, type = 'module') {
  return {
    package: { type, id },
    version,
    compatibility: { minimum: '14', verified: '14' },
    relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
    protected: false,
    origin: `https://files.test/${id}/${version}/module.json`,
    versionManifest: `https://files.test/${id}/${version}/module.json`,
    detail: 'loaded',
    ...more,
  };
}

/**
 * The releases of a module the catalogue holds, as `held` gives them.
 * @param id - The module's ID
 * @param versions - Its versions
 * @param more - What else differs of each
 * @returns The releases
 */
function released(id: string, versions: readonly string[], more: Record<string, unknown> = {}) {
  return versions.map(version => held(id, version, more));
}

/** What else a lookup's answer says, beside the releases. */
interface AnswerMore {
  readonly core?: unknown[];
  readonly pending?: unknown[];
  readonly unavailable?: unknown[];
  readonly unreached?: unknown[];
}

/**
 * The catalogue's answer to a lookup: the releases, each package once.
 * @param releases - The releases it holds, each with its package
 * @param more - What else it says
 * @returns The answer
 */
function answer(
  releases: readonly ({ package: { type: string; id: string } } & Record<string, unknown>)[],
  more: AnswerMore = {},
) {
  const packages = new Map<string, { package: { type: string; id: string }; releases: unknown[] }>();
  for (const { package: ref, ...release } of releases) {
    const key = `${ref.type}:${ref.id}`;
    const entry = packages.get(key) ?? { package: ref, releases: [] };
    entry.releases.push(release);
    packages.set(key, entry);
  }
  return {
    core: more.core ?? [],
    packages: [...packages.values()].map(entry => ({
      ...entry,
      title: entry.package.id,
      latest: null,
      premium: false,
      syncedAt: null,
      own: { version: null, readAt: null, checkedAt: null },
    })),
    pending: more.pending ?? [],
    unavailable: more.unavailable ?? [],
    unreached: more.unreached ?? [],
    asOf: null,
  };
}

/**
 * A fetch that answers the catalogue's lookup, and fails as a browser does for any other URL.
 * @param answered - The lookup's answer, or a status to fail with
 * @returns The fetch
 */
function catalogueFetch(answered: unknown) {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url !== LOOKUP) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      typeof answered === 'number' ? new Response('', { status: answered }) : Response.json(answered),
    );
  });
}

/**
 * Install the Foundry mocks and look up the versions of the modules given that are active.
 * @param options - The mock state
 * @param answered - The catalogue's answer, or a status to fail with
 * @param olderVersions - How many versions before the one installed, or chosen, to offer and consider; none by default
 * @returns The versions found, with the fetch used and the Foundry mocks
 */
async function lookUp(options: FoundryMockOptions, answered: unknown, olderVersions?: () => number) {
  const mocks = installFoundryMocks(options);
  const send = catalogueFetch(answered);
  const judge = createVersionJudge({
    catalogue: CATALOGUE,
    clientVersion: '0.7.0',
    fetch: send,
    ...(olderVersions !== undefined && { olderVersions }),
  });
  const active = Object.entries(options.modules ?? {}).flatMap(([id, data]) => (data.active === true ? [id] : []));
  await judge.lookUp(active);
  return { judge, send, active, ...mocks };
}

describe('createVersionJudge', () => {
  test('offers the installed version and the newer ones, newest first, and none older', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '5.2.4' }) } },
      answer(released('dice', ['4.0.0', '5.0.0', '5.1.0', '5.2.4', '5.3.0', '6.0.0'])),
    );

    expect(judge.versionsOf('dice')).toEqual(['6.0.0', '5.3.0', '5.2.4']);
  });

  test('offers as many versions before the installed one as the user chose', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '5.2.4' }) } },
      answer(released('dice', ['4.0.0', '5.0.0', '5.1.0', '5.3.0', '6.0.0'])),
      () => 2,
    );

    expect(judge.versionsOf('dice')).toEqual(['6.0.0', '5.3.0', '5.2.4', '5.1.0', '5.0.0']);
  });

  test('follows a change to how many older versions the user chose, the next time it is asked', async () => {
    let older = 0;
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '0.4.0' }) } },
      answer(released('dice', ['0.1.0', '0.2.0', '0.3.0', '0.4.0'])),
      () => older,
    );
    expect(judge.versionsOf('dice')).toEqual(['0.4.0']);

    older = 1;
    expect(judge.versionsOf('dice')).toEqual(['0.4.0', '0.3.0']);
    older = 10;
    expect(judge.versionsOf('dice')).toEqual(['0.4.0', '0.3.0', '0.2.0', '0.1.0']);
  });

  test('counts the versions before one written with a leading v, as the catalogue may give them without', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: 'v0.4.0' }) } },
      answer(released('dice', ['0.1.0', '0.2.0', '0.3.0', '0.5.0'])),
      () => 2,
    );

    expect(judge.versionsOf('dice')).toEqual(['0.5.0', 'v0.4.0', '0.3.0', '0.2.0']);
  });

  test('fetches nothing until asked, then asks once for the system and every installed module', async () => {
    installFoundryMocks({
      modules: {
        dice: installedModule('dice', { version: '1.0.0' }),
        lib: installedModule('lib', { active: false, version: '1.0.0' }),
        // A manifest URL the catalogue would refuse is not sent: not a URL, or not a web address.
        local: { active: false, version: '0.1.0', links: { manifest: 'modules/local/module.json' } },
        mirror: { active: false, version: '0.2.0', links: { manifest: 'ftp://files.test/mirror/module.json' } },
      },
      system: { id: 'dnd5e', title: 'D&D 5e', manifest: 'https://files.test/dnd5e/system.json' },
    });
    const send = catalogueFetch(answer([...released('dice', ['2.0.0']), ...released('lib', ['2.0.0'])]));
    const judge = createVersionJudge({ catalogue: CATALOGUE, clientVersion: '0.7.0', fetch: send });
    expect(send).not.toHaveBeenCalled();
    expect(judge.versionsOf('dice')).toEqual([]);
    expect(judge.reached).toBe(false);

    await Promise.all([judge.lookUp(['dice', 'missing']), judge.lookUp(['dice'])]);
    await judge.lookUp(['dice', 'lib']);

    expect(send).toHaveBeenCalledOnce();
    const [input, init] = send.mock.calls[0] ?? [];
    expect(input).toBe(LOOKUP);
    const headers = new Headers(init?.headers);
    expect(headers.get('X-API-Key')).toBe('cat-k3y');
    expect(headers.get('X-Catalogue-Client')).toBe('EMMA/0.7.0');
    expect(JSON.parse(init?.body as string)).toEqual({
      packages: [
        { type: 'system', id: 'dnd5e', installed: '5.1.0', manifest: 'https://files.test/dnd5e/system.json' },
        { type: 'module', id: 'dice', installed: '1.0.0', manifest: 'https://files.test/dice/latest/module.json' },
        { type: 'module', id: 'lib', installed: '1.0.0', manifest: 'https://files.test/lib/latest/module.json' },
        { type: 'module', id: 'local', installed: '0.1.0' },
        { type: 'module', id: 'mirror', installed: '0.2.0' },
      ],
      fromGeneration: 14,
    });
    expect(judge.reached).toBe(true);
    expect(judge.versionsOf('lib')).toEqual(['2.0.0', '1.0.0']);
  });

  test('names itself to the catalogue only with a version', async () => {
    installFoundryMocks({ modules: { dice: installedModule('dice') } });
    const send = catalogueFetch(answer([]));

    await createVersionJudge({ catalogue: CATALOGUE, fetch: send }).lookUp(['dice']);

    expect(new Headers(send.mock.calls[0]?.[1]?.headers).has('X-Catalogue-Client')).toBe(false);
  });

  test('reads a core release channel it does not know as stable', async () => {
    const mocks = installFoundryMocks({ modules: { dice: installedModule('dice', { version: '1.0.0' }) } });
    Object.assign(mocks.game.release, { channel: 'nightly' });

    const judge = createVersionJudge({ catalogue: CATALOGUE, fetch: catalogueFetch(answer([])) });
    await judge.lookUp(['dice']);

    expect(judge.judgeChoices(['dice'], NONE).get('dice')?.badge?.type).toBe('success');
  });

  test('lists only the installed version of a module the catalogue does not give', async () => {
    const { judge } = await lookUp({ modules: { local: { active: true, version: '0.1.0' } } }, answer([]));

    expect(judge.versionsOf('local')).toEqual(['0.1.0']);
  });

  test('still offers the installed version when the catalogue does not list it', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.1-dev' }) } },
      answer(released('dice', ['1.0.0', '1.1.0'])),
    );

    expect(judge.versionsOf('dice')).toContain('1.0.1-dev');
  });

  test('names the installed packages the catalogue could not list all the sources of', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice'), lib: installedModule('lib') } },
      answer([], {
        unreached: [
          { type: 'module', id: 'dice' },
          // A package needed but not installed is not named.
          { type: 'module', id: 'needed' },
        ],
      }),
    );

    expect(judge.reached).toBe(true);
    expect(judge.unreached).toEqual([{ type: 'module', id: 'dice' }]);
  });

  test('knows only what is installed when the catalogue cannot be reached, naming every package and the core', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }) }, system: { id: 'dnd5e', title: 'D&D 5e' } },
      503,
    );

    expect(judge.reached).toBe(false);
    expect(judge.versionsOf('dice')).toEqual(['1.0.0']);
    expect(judge.platformVersions('core')).toEqual(['14.368']);
    expect(judge.unreached).toEqual([
      { type: 'system', id: 'dnd5e' },
      { type: 'module', id: 'dice' },
      { type: 'core', id: 'core' },
    ]);
  });

  test('asks nothing without a catalogue, knowing only what is installed', async () => {
    installFoundryMocks({ modules: { dice: installedModule('dice', { version: '1.0.0' }) } });
    const send = vi.fn();
    const judge = createVersionJudge({ catalogue: null, fetch: send });

    await judge.lookUp(['dice']);

    expect(send).not.toHaveBeenCalled();
    expect(judge.reached).toBe(false);
    expect(judge.versionsOf('dice')).toEqual(['1.0.0']);
  });

  test('judges the installed version on its manifest when the catalogue does not give it', async () => {
    const { judge, foundry, active } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }) } },
      answer(released('dice', ['2.0.0'], { compatibility: { minimum: '15', verified: '15' } })),
    );

    const judged = judge.judgeVersions(active, NONE, 'dice');
    expect(judged.map(({ version, badge }) => [version, badge?.tooltip])).toEqual([
      ['2.0.0', `availability ${String(REQUIRES_CORE_UPGRADE_UNKNOWN)}`],
      ['1.0.0', `availability ${String(VERIFIED)}`],
    ]);
    expect(foundry.getVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({ id: 'dice', version: '1.0.0', compatibility: { minimum: '14', verified: '14' } }),
      expect.anything(),
    );
  });
});

describe('judging choices', () => {
  const modules = {
    lib: installedModule('lib', { version: '2.0.0' }),
    addon: installedModule('addon', {
      version: '1.0.0',
      requires: [{ id: 'lib', compatibility: { maximum: '2.0.0' } }],
      systems: ['dnd5e'],
    }),
  };
  const held3 = answer(released('lib', ['3.0.0']));

  test('gives each module of the setup its installed version and badge until another is chosen', async () => {
    const { judge, active } = await lookUp({ modules }, held3);

    const chosen = judge.judgeChoices(active, NONE);

    expect([...chosen].map(([id, { version, badge }]) => [id, version, badge?.type])).toEqual([
      ['lib', '2.0.0', 'success'],
      ['addon', '1.0.0', 'success'],
    ]);
  });

  test('judges every module in the setup the choices make', async () => {
    const { judge, active } = await lookUp({ modules }, held3);

    const chosen = judge.judgeChoices(active, { modules: new Map([['lib', '3.0.0']]) });

    expect(chosen.get('lib')?.version).toBe('3.0.0');
    expect(chosen.get('addon')?.badge?.tooltip).toBe(`availability ${String(MISSING_DEPENDENCY)}`);
  });

  test('judges only the modules of the setup, as a module staged inactive is missing from it', async () => {
    const { judge } = await lookUp({ modules }, held3);

    const chosen = judge.judgeChoices(['addon', 'missing'], NONE);

    expect([...chosen.keys()]).toEqual(['addon']);
    expect(chosen.get('addon')?.badge?.tooltip).toBe(`availability ${String(MISSING_DEPENDENCY)}`);
  });

  test('judges each version of a module with the other modules at their chosen versions', async () => {
    const { judge, foundry, active } = await lookUp({ modules }, held3);

    const judged = judge.judgeVersions(active, NONE, 'addon');
    const [newest] = judge.judgeVersions(active, { modules: new Map([['addon', '1.0.0']]) }, 'lib');

    expect(judged.map(({ version }) => version)).toEqual(['1.0.0']);
    expect(newest?.version).toBe('3.0.0');
    // Foundry names the dependencies from the release's relationships.
    expect(foundry.getVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({
        relationships: {
          requires: [expect.objectContaining({ id: 'lib', type: 'module', compatibility: { maximum: '2.0.0' } })],
          systems: [expect.objectContaining({ id: 'dnd5e', type: 'system' })],
        },
      }),
      expect.anything(),
    );
  });

  test('has no versions to judge for a module not installed', async () => {
    const { judge, active } = await lookUp({ modules }, held3);

    expect(judge.judgeVersions(active, NONE, 'missing')).toEqual([]);
  });
});

describe('the core and the system', () => {
  const system = { id: 'dnd5e', title: 'D&D 5e', manifest: 'https://files.test/dnd5e/system.json' };
  const systemRelease = (version: string, more: Record<string, unknown> = {}) => held('dnd5e', version, more, 'system');
  // 5.2.0 is known only from the system's manifest URL, which gives the newest, so it has no manifest of its own: the
  // answer, sent as JSON, leaves the field out.
  const newestOnly = systemRelease('5.2.0', {
    manifest: 'https://files.test/dnd5e/system.json',
    versionManifest: undefined,
  });
  const cores = [
    { version: '15.380', generation: 15, channel: 'prototype' },
    { version: '14.370', generation: 14, channel: 'testing' },
    { version: '14.369', generation: 14, channel: 'stable' },
    { version: '14.368', generation: 14, channel: 'stable' },
    { version: '14.360', generation: 14, channel: 'stable' },
  ];
  const held520 = answer([systemRelease('5.1.0'), newestOnly], { core: cores });
  const modules = {
    dice: {
      active: true,
      title: 'Dice & Co',
      version: '1.0.0',
      compatibility: { minimum: '14', verified: '14', maximum: '14.368' },
      systems: [{ id: 'dnd5e', compatibility: { maximum: '5.1.0' } }],
    },
  };

  test('offers the newer builds the catalogue gives on the core’s channel or a more stable one', async () => {
    const { judge } = await lookUp({ modules, system }, held520);

    expect(judge.platformVersions('core')).toEqual(['14.369', '14.368']);
    expect(judge.unreached).toEqual([]);
  });

  test('offers testing builds too while on one', async () => {
    const mocks = installFoundryMocks({ modules, system, version: '14.368' });
    Object.assign(mocks.game.release, { channel: 'testing' });
    const judge = createVersionJudge({ catalogue: CATALOGUE, fetch: catalogueFetch(held520) });
    await judge.lookUp(['dice']);

    expect(judge.platformVersions('core')).toEqual(['14.370', '14.369', '14.368']);
  });

  test('offers the system in use and its newer versions, newest first', async () => {
    const { judge } = await lookUp({ modules, system }, held520);

    expect(judge.platformVersions('system')).toEqual(['5.2.0', '5.1.0']);
  });

  test('judges every module with the core and the system chosen', async () => {
    const { judge, active } = await lookUp({ modules, system }, held520);

    expect(judge.judgeChoices(active, NONE).get('dice')?.badge?.type).toBe('success');
    expect(judge.judgeChoices(active, { system: '5.2.0', modules: new Map() }).get('dice')?.badge?.type).toBe(
      'warning',
    );
    expect(judge.judgeChoices(active, { core: '14.369', modules: new Map() }).get('dice')?.badge?.type).toBe('error');
    // A module's versions are judged with them too.
    const [installed] = judge.judgeVersions(active, { system: '5.2.0', modules: new Map() }, 'dice');
    expect(installed?.badge?.type).toBe('warning');
  });

  test('judges each core or system version by the worst fit it leaves, naming what does not fit', async () => {
    const { judge, active, foundry } = await lookUp({ modules, system }, held520);

    const systems = judge.judgePlatform(active, NONE, 'system');
    const builds = judge.judgePlatform(active, NONE, 'core');

    expect(systems.map(({ version, badge }) => [version, badge?.type])).toEqual([
      ['5.2.0', 'warning'],
      ['5.1.0', 'success'],
    ]);
    expect(systems[0]?.missingManifest).toBe(true);
    expect(systems[1]?.missingManifest).toBeUndefined();
    expect(systems[0]?.badge?.text).toBe(
      'MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Dice & Co"} MONDARTH-EMMA.Versions.NoManifest',
    );
    // The tooltip is HTML, so the titles in it are escaped.
    expect(systems[0]?.badge?.tooltip).toBe(
      'MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Dice &amp; Co"}<br>MONDARTH-EMMA.Versions.NoManifest',
    );
    expect(systems[0]?.badge?.icon).toBe('fa-solid icon-3');
    expect(systems[1]?.badge).toEqual({
      type: 'success',
      icon: 'fa-solid fa-code-branch',
      tooltip: 'MONDARTH-EMMA.Versions.Fit.Verified',
      text: 'MONDARTH-EMMA.Versions.Fit.Verified',
    });
    expect(builds.map(({ version, badge }) => [version, badge?.type])).toEqual([
      ['14.369', 'error'],
      ['14.368', 'success'],
    ]);
    expect(builds[0]?.badge?.text).toBe('MONDARTH-EMMA.Versions.Fit.Unusable {"packages":"Dice & Co"}');
    // The system's badge is the system's own.
    expect(foundry.systemVersionBadge).toHaveBeenCalledWith(
      VERIFIED,
      expect.objectContaining({ id: 'dnd5e', version: '5.1.0' }),
      expect.anything(),
    );
  });

  test('gives Foundry the setup’s system and modules to name what does not suit, as a world has no game.systems', async () => {
    const lib = { active: true, title: 'Lib', version: '1.0.0', compatibility: { minimum: '14', verified: '14' } };
    const { judge, active, foundry } = await lookUp(
      { modules: { ...modules, lib, idle: { version: '1.0.0' } }, system },
      held520,
    );

    const chosen = judge.judgeChoices(active, { system: '5.2.0', modules: new Map() });

    expect(chosen.get('dice')?.badge?.type).toBe('warning');
    const options = foundry.getVersionBadge.mock.calls.find(([, data]) => data.version === '1.0.0')?.[2] as {
      systems: Map<string, { version: string; unavailable: boolean }>;
      modules: Map<string, unknown>;
    };
    expect([...options.systems]).toEqual([['dnd5e', { id: 'dnd5e', version: '5.2.0', unavailable: false }]]);
    // Only the modules in the setup, so a module installed but not staged active counts as missing.
    expect([...options.modules.keys()].sort()).toEqual(['dice', 'lib']);
  });

  test('reports on the setup chosen, naming packages by their titles', async () => {
    const { judge, active } = await lookUp({ modules, system }, held520);

    const check = judge.reportCheck(active, { system: '5.2.0', modules: new Map() });

    expect(check.setup).toEqual({
      core: '14.368',
      system: 'MONDARTH-EMMA.Report.Explain.Term {"name":"D&D 5e","versions":"5.2.0"}',
      modules: 1,
    });
    expect(check.modules.map(({ title, badge }) => [title, badge?.type])).toEqual([['Dice & Co', 'warning']]);
    expect(judge.reportPlan(active, NONE)).toEqual([
      { id: 'dice', title: 'Dice & Co', changes: false, manifest: null },
    ]);
  });

  test('finds the best module versions for the core and system chosen, whatever module versions were chosen', async () => {
    const lib = { active: true, title: 'Lib', version: '1.0.0', compatibility: { minimum: '14', verified: '14' } };
    const { judge, active } = await lookUp({ modules: { ...modules, lib }, system }, held520);

    const kept = await judge.reportSolve(active, { modules: new Map([['lib', '1.0.0']]) });
    // Dice works with Foundry 14.368 at most, and runs only in dnd5e 5.1.0 or earlier.
    const newerCore = await judge.reportSolve(active, { core: '14.369', modules: new Map() });
    const newerSystem = await judge.reportSolve(active, { system: '5.2.0', modules: new Map() });

    expect(kept.solution).toEqual({ kind: 'found', changes: [] });
    // The core chosen is kept, so the explanation names it as chosen.
    expect(newerCore.solution.kind === 'none' ? newerCore.solution.lines.join(' ') : '').toContain(
      'Report.Explain.Pin',
    );
    expect(newerSystem.solution.kind).toBe('none');
  });

  test('names both what will not work and what may not', async () => {
    // Verified only with an older generation of Foundry, so it may not work with any build of 14.
    const lib = { active: true, title: 'Lib', version: '1.0.0', compatibility: { minimum: '13', verified: '13' } };
    const { judge, active } = await lookUp({ modules: { ...modules, lib }, system }, held520);

    const [newest] = judge.judgePlatform(active, NONE, 'core');

    expect(newest?.badge?.text).toBe(
      'MONDARTH-EMMA.Versions.Fit.Unusable {"packages":"Dice & Co"} MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Lib"}',
    );
    expect(newest?.badge?.tooltip).toBe(
      'MONDARTH-EMMA.Versions.Fit.Unusable {"packages":"Dice &amp; Co"}<br>MONDARTH-EMMA.Versions.Fit.Unverified {"packages":"Lib"}',
    );
  });
});

describe('the reports', () => {
  /** Dice, installed at 4.0.0, with 1.0.0 to 5.0.0 released, each needing a newer core than the one in use. */
  const needsNewer = { compatibility: { minimum: '15', verified: '15' } };
  const dice = installedModule('dice', { version: '4.0.0', ...needsNewer });
  const releases = answer(released('dice', ['1.0.0', '2.0.0', '3.0.0', '4.0.0', '5.0.0'], needsNewer));

  /**
   * Everything a solve says, in one string.
   * @param solved - The solve
   * @returns Its solution and its unloaded releases
   */
  const said = (solved: SetupSolve) => JSON.stringify(solved);

  test('consider the version chosen of each module and newer ones, never older, by default', async () => {
    const { judge, active } = await lookUp({ modules: { dice } }, releases);

    const solved = await judge.reportSolve(active, { modules: new Map([['dice', '4.0.0']]) });

    expect(said(solved)).toContain('5.0.0');
    for (const version of ['1.0.0', '2.0.0', '3.0.0']) expect(said(solved)).not.toContain(version);
  });

  test('consider the version chosen of each module, as many before it as the user chose, and newer ones', async () => {
    const { judge, active } = await lookUp({ modules: { dice } }, releases, () => 2);

    const solved = await judge.reportSolve(active, { modules: new Map([['dice', '4.0.0']]) });

    for (const version of ['2.0.0', '3.0.0', '5.0.0']) expect(said(solved)).toContain(version);
    expect(said(solved)).not.toContain('1.0.0');
  });

  test('count from the version chosen, not the one installed', async () => {
    const { judge, active } = await lookUp({ modules: { dice } }, releases, () => 2);

    const solved = await judge.reportSolve(active, { modules: new Map([['dice', '5.0.0']]) });

    expect(said(solved)).toContain('3.0.0');
    expect(said(solved)).not.toContain('2.0.0');
    expect(said(solved)).not.toContain('1.0.0');
  });

  test('count a version written with a leading v as the same version, so the range is still found', async () => {
    // socketlib's manifest gives `v1.1.4`, which Foundry reports as installed, where its release tags give `1.1.4`.
    const prefixed = installedModule('dice', { version: 'v4.0.0', ...needsNewer });
    const { judge, active } = await lookUp(
      { modules: { dice: prefixed } },
      answer(released('dice', ['1.0.0', '2.0.0', '3.0.0', '5.0.0'], needsNewer)),
      () => 2,
    );

    const solved = await judge.reportSolve(active, NONE);

    for (const version of ['2.0.0', '3.0.0', '5.0.0']) expect(said(solved)).toContain(version);
    expect(said(solved)).not.toContain('1.0.0');
  });

  test('consider every older version when fewer than two are known', async () => {
    const { judge, active } = await lookUp({ modules: { dice } }, releases, () => 2);

    const solved = await judge.reportSolve(active, { modules: new Map([['dice', '2.0.0']]) });

    expect(said(solved)).toContain('1.0.0');
  });
});

describe('what the catalogue says of the releases', () => {
  describe('a module the catalogue says cannot be had', () => {
    const modules = {
      dice: installedModule('dice', { version: '1.0.0' }),
      babonus: installedModule('babonus', { version: '12.5.8' }),
      lost: installedModule('lost', { version: '1.0.0' }),
    };
    const gone = answer([held('dice', '1.0.0')], {
      unavailable: [
        { package: { type: 'module', id: 'babonus' }, reason: 'archived' },
        { package: { type: 'module', id: 'lost' }, reason: 'gone', note: 'Its repository was deleted.' },
      ],
    });

    test('has no versions, not even the one installed', async () => {
      const { judge } = await lookUp({ modules }, gone);

      expect(judge.versionsOf('babonus')).toEqual([]);
      expect(judge.judgeVersions(['dice', 'babonus'], NONE, 'babonus')).toEqual([]);
      expect(judge.unreached).toEqual([]);
    });

    test('is named, with why, and left out of every report', async () => {
      const { judge } = await lookUp({ modules }, gone);
      const active = ['dice', 'babonus', 'lost'];

      expect(judge.reportUnavailable(active, NONE)).toEqual([
        { title: expect.any(String) as string, reason: 'archived' },
        { title: expect.any(String) as string, reason: 'gone', note: 'Its repository was deleted.' },
      ]);
      const check = judge.reportCheck(active, NONE);
      expect(check.modules.map(({ id }) => id)).toEqual(['dice']);
      expect(check.setup.modules).toBe(1);
      expect(judge.reportPlan(active, NONE).map(({ id }) => id)).toEqual(['dice']);
      expect([...judge.judgeChoices(active, NONE).keys()]).toEqual(['dice']);
      const solved = await judge.reportSolve(active, NONE);
      expect(solved.solution.kind).toBe('found');
    });

    test('is taken as present, not named, when hypothetical mode ignores it', async () => {
      const { judge } = await lookUp({ modules }, gone);
      const choices = { ...NONE, ignored: new Set(['babonus']) };

      expect(judge.reportUnavailable(['dice', 'babonus'], choices)).toEqual([]);
      expect(judge.reportCheck(['dice', 'babonus'], choices).setup.modules).toBe(1);
    });

    test('is named by its ID when it is not installed, and only modules are, not a system', async () => {
      const { judge } = await lookUp(
        { modules },
        answer([held('dice', '1.0.0')], {
          unavailable: [
            { package: { type: 'module', id: 'old-lib' }, reason: 'archived' },
            { package: { type: 'system', id: 'old-system' }, reason: 'archived' },
          ],
        }),
      );

      expect(judge.reportUnavailable(['dice', 'old-lib', 'old-system'], NONE)).toEqual([
        { title: 'old-lib', reason: 'archived' },
      ]);
    });

    test('is not named when it is not active', async () => {
      const { judge } = await lookUp({ modules }, gone);

      expect(judge.reportUnavailable(['dice'], NONE)).toEqual([]);
    });
  });

  // Regression: each judgement checked the whole universe, which with the catalogue holds every version of
  // everything the setup needs, so the drop-downs paused for seconds while each option was judged.
  test('judges each version with only the releases the setup chooses', async () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0'];
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }), lib: { active: true, version: '3.0.0' } } },
      answer([...released('dice', versions), ...released('lib', ['2.0.0', '3.0.0'])]),
    );

    checked.universes.length = 0;
    const options = judge.judgeVersions(['dice', 'lib'], NONE, 'dice');
    expect(options.map(option => option.version)).toEqual(['2.1.0', '2.0.0', '1.2.0', '1.1.0', '1.0.0']);
    // For each, the system's release, one of dice and one of lib: never dice's other versions, nor lib's.
    expect(checked.universes.map(given => given.releases.length)).toEqual([3, 3, 3, 3, 3]);
  });

  test('says which versions are not on Foundry’s package listing, as the catalogue marks them', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }) } },
      answer([held('dice', '1.0.0'), held('dice', '2.0.0', { unlisted: true })]),
    );

    const [newest, installed] = judge.judgeVersions(['dice'], NONE, 'dice');
    expect(newest).toMatchObject({ version: '2.0.0', unlisted: true });
    expect(newest?.badge?.tooltip).toContain('MONDARTH-EMMA.Versions.Unlisted');
    expect(newest?.badge?.text).toContain('MONDARTH-EMMA.Versions.Unlisted');
    expect(installed).not.toHaveProperty('unlisted');
    expect(installed?.badge?.tooltip).not.toContain('MONDARTH-EMMA.Versions.Unlisted');
    // Chosen, it says so on the module's own badge too.
    const chosen = judge.judgeChoices(['dice'], { modules: new Map([['dice', '2.0.0']]) }).get('dice');
    expect(chosen).toMatchObject({ unlisted: true });
  });

  test('says so of a system version not on the listing, and never of a core build', async () => {
    const { judge } = await lookUp(
      {
        modules: { dice: installedModule('dice', { version: '1.0.0' }) },
        system: { id: 'dnd5e', title: 'D&D 5e', version: '5.0.0' },
      },
      answer([
        held('dice', '1.0.0'),
        held('dnd5e', '5.0.0', {}, 'system'),
        held('dnd5e', '6.0.0', { unlisted: true }, 'system'),
      ]),
    );

    const systems = judge.judgePlatform(['dice'], NONE, 'system');
    expect(systems.map(option => [option.version, option.unlisted ?? false])).toEqual([
      ['6.0.0', true],
      ['5.0.0', false],
    ]);
    expect(judge.judgePlatform(['dice'], NONE, 'core').some(option => option.unlisted)).toBe(false);
  });

  describe('with a module hypothetical mode ignores', () => {
    const needsSynth = (compatibility: Record<string, string> = {}) => ({
      requires: [{ package: { type: 'module', id: 'synth' }, compatibility }],
      systems: [],
      conflicts: [],
      recommends: [],
    });

    /**
     * Look up dice, which requires synth, a module with no manifest the catalogue can read, which hypothetical mode is
     * told to ignore.
     * @param versions - The versions of dice the catalogue holds; only the installed one by default
     * @returns The judge, the choices that ignore synth, and the modules active
     */
    async function withSynthetic(versions: readonly string[] = ['1.0.0']) {
      const found = await lookUp(
        {
          modules: { dice: installedModule('dice', { version: '1.0.0' }), synth: { active: true, version: '0.0.1' } },
        },
        answer(released('dice', versions, { relationships: needsSynth() })),
      );
      const choices = { modules: new Map<string, string>(), ignored: new Set(['synth']) };
      return { ...found, choices, active: ['dice', 'synth'] };
    }

    test('takes it as present, so what requires it is satisfied, and judges it not at all', async () => {
      const { judge, choices, active } = await withSynthetic();

      const judged = judge.judgeChoices(active, choices);
      expect(judged.get('dice')?.badge?.tooltip).toBe(`availability ${String(VERIFIED)}`);
      expect(judged.has('synth')).toBe(false);
      expect(judge.judgeVersions(active, choices, 'synth')).toEqual([]);
      // Taken as present, it leaves nothing unknown in the setup checked.
      expect(judge.reportCheck(active, choices).valid).toBe(true);
    });

    // Regression: a module requiring a newer version of it than the one installed, which the release standing for it
    // has, could not be satisfied: the update found no setup, saying no version of it would do.
    test('satisfies whatever version of it the others require, as it is taken as present', async () => {
      const found = await lookUp(
        { modules: { dice: installedModule('dice', { version: '1.0.0' }), synth: { version: '0.0.1' } } },
        answer([held('dice', '1.0.0', { relationships: needsSynth({ minimum: '0.2.0' }) })]),
      );
      const active = ['dice', 'synth'];
      const choices = { modules: new Map<string, string>(), ignored: new Set(['synth']) };

      const solved = await found.judge.reportSolve(active, choices);

      expect(solved.solution).toEqual({ kind: 'found', changes: [] });
      expect(found.judge.reportCheck(active, choices).valid).toBe(true);
      expect(found.judge.judgeChoices(active, choices).get('dice')?.badge?.tooltip).toBe(
        `availability ${String(VERIFIED)}`,
      );
    });

    // Regression: an ignored module that is installed but not staged active, which a module requires, as midi-qol
    // pulls in a synthetic module, had nothing standing for it, and its own releases were left out: the update found
    // no version of it at all.
    test('stands for it when it is installed but not active, and another requires it', async () => {
      const found = await lookUp(
        { modules: { dice: installedModule('dice', { version: '1.0.0' }), synth: { version: '0.0.1' } } },
        answer([
          held('dice', '1.0.0', { relationships: needsSynth({ minimum: '0.2.0' }) }),
          held('synth', '0.0.1', { compatibility: { minimum: '99' } }),
        ]),
      );
      const choices = { modules: new Map<string, string>(), ignored: new Set(['synth']) };

      const solved = await found.judge.reportSolve(['dice'], choices);

      expect(solved.solution).toEqual({ kind: 'found', changes: [] });
      const check = found.judge.reportCheck(['dice'], choices);
      expect(check.valid).toBe(true);
      expect(check.modules.map(({ id }) => id)).toEqual(['dice']);
      expect(check.setup.modules).toBe(1);
      expect(found.judge.reportPlan(['dice'], choices).map(({ id }) => id)).toEqual(['dice']);
      expect([...found.judge.judgeChoices(['dice'], choices).keys()]).toEqual(['dice']);
    });

    // Regression: the update leaves out versions that look like pre-releases, as a hand-made synthetic module's may,
    // so the release standing for one such was left out too: the update found no version of it.
    test('stands for it whatever its version looks like, as the update would leave a pre-release out', async () => {
      const found = await lookUp(
        {
          modules: {
            dice: installedModule('dice', { version: '1.0.0' }),
            synth: { active: true, version: '1.0.0-dev' },
          },
        },
        answer([held('dice', '1.0.0', { relationships: needsSynth() })]),
      );
      const choices = { modules: new Map<string, string>(), ignored: new Set(['synth']) };

      const solved = await found.judge.reportSolve(['dice', 'synth'], choices);

      expect(solved.solution).toEqual({ kind: 'found', changes: [] });
    });

    test('lets the update find the best versions of the others, changing it not at all', async () => {
      const { judge, choices, active } = await withSynthetic(['1.0.0', '1.1.0']);

      const solved = await judge.reportSolve(active, choices);

      expect(solved.solution).toEqual({
        kind: 'found',
        changes: [
          { package: { type: 'module', id: 'dice' }, title: expect.any(String) as string, from: '1.0.0', to: '1.1.0' },
        ],
      });
    });

    test('leaves it out of the fit of each core or system version, and of the reports', async () => {
      const { judge, choices, active } = await withSynthetic();

      expect(judge.judgePlatform(active, choices, 'core').every(option => !option.badge?.text.includes('synth'))).toBe(
        true,
      );
      const check = judge.reportCheck(active, choices);
      expect(check.modules.map(reported => reported.id)).toEqual(['dice']);
      expect(check.setup.modules).toBe(1);
      expect(judge.reportPlan(active, choices).map(entry => entry.id)).not.toContain('synth');
    });
  });

  test('loads nothing more when solving: a release the catalogue could not load is named as unloaded', async () => {
    const { judge, active, send } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }) } },
      answer([held('dice', '2.0.0', { detail: 'listed', compatibility: {} })]),
    );

    const solved = await judge.reportSolve(active, { modules: new Map([['dice', '2.0.0']]) });

    expect(send).toHaveBeenCalledOnce();
    expect(solved.unloaded).toEqual(['MONDARTH-EMMA.Report.Explain.Term {"name":"dice","versions":"2.0.0"}']);
  });

  test('recommends the newest version of a module that works, as a change to the setup', async () => {
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }) } },
      answer(released('dice', ['1.0.0', '1.1.0'])),
    );

    const solved = await judge.reportSolve(['dice'], NONE);

    expect(solved.solution).toEqual({
      kind: 'found',
      changes: [
        { package: { type: 'module', id: 'dice' }, title: expect.any(String) as string, from: '1.0.0', to: '1.1.0' },
      ],
    });
  });

  test('never recommends or offers a version with no manifest of its own, except the one installed', async () => {
    // Known only from a manifest URL that gives the newest.
    const bare = (version: string) => {
      const { versionManifest, ...rest } = held('dice', version);
      return { ...rest, manifest: versionManifest.replace(`/${version}/`, '/latest/') };
    };
    const { judge } = await lookUp(
      { modules: { dice: installedModule('dice', { version: '1.0.0' }) } },
      answer([bare('1.0.0'), held('dice', '1.1.0'), bare('2.0.0')]),
    );

    const solved = await judge.reportSolve(['dice'], NONE);
    const listed = judge.judgeVersions(['dice'], NONE, 'dice');

    expect(solved.solution).toEqual({
      kind: 'found',
      changes: [
        { package: { type: 'module', id: 'dice' }, title: expect.any(String) as string, from: '1.0.0', to: '1.1.0' },
      ],
    });
    expect(listed.map(({ version, missingManifest }) => [version, missingManifest])).toEqual([
      ['2.0.0', true],
      ['1.1.0', undefined],
      ['1.0.0', undefined],
    ]);
  });

  // Regression: a module looked up before it was ignored kept its own releases in the reports' universe, which the
  // check found before the release standing for it: the check called the setup unusable, and the update changed it.
  test('reports a module ignored after it was looked up as left out, judging none of its own releases', async () => {
    const { judge } = await lookUp(
      {
        modules: { dice: installedModule('dice', { version: '1.0.0' }), synth: { active: true, version: '0.0.1' } },
      },
      answer([
        held('dice', '1.0.0'),
        held('synth', '0.0.1', { compatibility: { minimum: '99' } }),
        held('synth', '0.0.2', { compatibility: { minimum: '99' } }),
      ]),
    );
    const active = ['dice', 'synth'];
    expect(judge.reportCheck(active, NONE).valid).toBe(false);

    const choices = { modules: new Map<string, string>(), ignored: new Set(['synth']) };
    const check = judge.reportCheck(active, choices);
    expect(check.valid).toBe(true);
    expect(check.modules.map(reported => reported.id)).toEqual(['dice']);
    const solved = await judge.reportSolve(active, choices);
    expect(
      solved.solution.kind === 'found' ? solved.solution.changes.map(change => change.package.id) : [],
    ).not.toContain('synth');
    expect(judge.reportIgnored(active, choices)).toEqual(['synth']);
    expect(judge.reportIgnored(active, NONE)).toEqual([]);
    // One it knows no title of is named by its ID.
    expect(judge.reportIgnored(['ghost'], { modules: new Map(), ignored: new Set(['ghost']) })).toEqual(['ghost']);
    // With the GMs' note on why, as the views show it.
    setIgnoredNotes({ synth: 'Midi-QOL makes it' });
    try {
      expect(judge.reportIgnored(active, choices)).toEqual(['synth [Midi-QOL makes it]']);
    } finally {
      setIgnoredNotes({});
    }
  });
});

describe('createInstalledJudge', () => {
  /** A module verified with the core in use, as the mocks' `14.368`. */
  const verified = { compatibility: { minimum: '14', verified: '14' } };
  /**
   * The badge's tooltip the Foundry mock gives an availability.
   * @param code - The availability
   * @returns The tooltip
   */
  const tooltipOf = (code: number) => `availability ${String(code)}`;

  test('judges an active module verified with the core and the system in use as verified, fetching nothing', () => {
    installFoundryMocks({ modules: { dice: { ...verified, active: true, systems: ['dnd5e'] } } });
    const send = vi.spyOn(globalThis, 'fetch');

    const badges = createInstalledJudge()(['dice']);

    expect(badges.get('dice')?.tooltip).toBe(tooltipOf(AVAILABILITY.VERIFIED));
    expect(send).not.toHaveBeenCalled();
  });

  // Regression: Foundry's own badge judges the core alone, so a module needing another system version was verified.
  test('judges a module that does not support the version of the system in use as such, active or not', () => {
    installFoundryMocks({
      modules: {
        coven: { ...verified, active: true, systems: [{ id: 'dnd5e', compatibility: { minimum: '6.0.0' } }] },
        other: { ...verified, systems: [{ id: 'dnd5e', compatibility: { minimum: '6.0.0' } }] },
      },
    });

    const badges = createInstalledJudge()(['coven']);

    // As hypothetical mode judges it: the system is installed, but not a version the module supports.
    expect(badges.get('coven')?.tooltip).toBe(tooltipOf(AVAILABILITY.UNVERIFIED_SYSTEM));
    expect(badges.get('other')?.tooltip).toBe(tooltipOf(AVAILABILITY.UNVERIFIED_SYSTEM));
  });

  test('judges an active module missing what it requires as unusable, and the same module inactive by itself', () => {
    installFoundryMocks({ modules: { dice: { ...verified, active: true, requires: ['lib'] }, lib: verified } });
    const judge = createInstalledJudge();

    expect(judge(['dice']).get('dice')?.tooltip).toBe(tooltipOf(AVAILABILITY.MISSING_DEPENDENCY));
    expect(judge(['dice', 'lib']).get('dice')?.tooltip).toBe(tooltipOf(AVAILABILITY.VERIFIED));
    // Inactive, what it requires does not matter yet.
    expect(judge([]).get('dice')?.tooltip).toBe(tooltipOf(AVAILABILITY.VERIFIED));
  });

  test('gives no badge for a module whose manifest it cannot read, leaving Foundry’s', () => {
    // An ID no package can have, so no release.
    installFoundryMocks({ modules: { 'bad id': { ...verified, active: true } } });

    expect(createInstalledJudge()(['bad id']).has('bad id')).toBe(false);
  });
});

describe('incompatibleModules', () => {
  const verified = { compatibility: { minimum: '14', verified: '14' } };

  test('finds the modules that cannot run with the Foundry version or game system in use, whatever is active', () => {
    installFoundryMocks({
      modules: {
        dice: { ...verified, requires: ['lib'], conflicts: ['tool'] },
        future: { compatibility: { minimum: '15' } },
        past: { compatibility: { minimum: '12', maximum: '13' } },
        other: { ...verified, systems: ['pf2e'] },
        // As Covin 0.1.3: for D&D 5e, but not the version in use, the mocks' 5.1.0.
        covin: { ...verified, systems: [{ id: 'dnd5e', compatibility: { minimum: '6.0.0' } }] },
        unknown: {},
        tool: verified,
      },
    });

    // One whose declared systems leave out the one in use is too, which Foundry badges "Incompatible Systems"; one
    // whose compatibility is unknown is only unverified.
    expect([...incompatibleModules()].sort()).toEqual(['covin', 'future', 'other', 'past']);
  });
});
