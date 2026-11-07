import { afterEach, describe, expect, test, vi } from 'vitest';

import { UpdateState, versionIn } from '../../../src/app/update-state.svelte';
import { KitUnavailable } from '../../../src/foundry/setup-kit';
import { buildOverview } from '../../../src/lib/overview';
import type { CatalogueState, ManifestRead, PackageUpdate, UpdateSearch } from '../../../src/lib/updates';
import type { PlanEntry, Planner } from '../../../src/lib/plans';
import { UNINSTALL } from '../../../src/lib/plans';
import { alone, installation, installedModule, release } from '../../mocks/fixtures';

const OVERVIEW = buildOverview(installation(), new Map());

const APP: PackageUpdate = {
  key: 'module:app',
  installed: '1.0.0',
  newest: '2.0.0',
  versions: ['2.0.0', '1.5.0', '1.0.0'],
};
const LIB: PackageUpdate = { key: 'module:lib', installed: '1.0.0', newest: '1.1.0', versions: ['1.1.0', '1.0.0'] };

/**
 * A search that finds some updates.
 * @param updates - The updates
 * @returns What it found
 */
const finding = (...updates: PackageUpdate[]): UpdateSearch => ({
  updates: new Map(updates.map(update => [update.key, update])),
  blocked: new Map(),
  unresolved: [],
  judge: (key, version, chosen) => ({
    version,
    badge: { type: 'success', icon: '', tooltip: '', text: `${key} ${version} with ${chosen('module:lib') ?? 'none'}` },
  }),
  planner: alone(...updates),
});

describe('UpdateState', () => {
  test('searches, then keeps what it found', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));
    expect(updates.status).toBe('idle');

    const searching = updates.searchFor(OVERVIEW);
    expect(updates.status).toBe('searching');
    await searching;

    expect(updates.status).toBe('found');
    expect(updates.updateOf('module:app')).toBe(APP);
    expect(updates.updateOf('module:other')).toBeUndefined();
    expect(updates.chosenOf('module:app')).toBe('1.0.0');
  });

  test('gives the newer version of a package EMMA cannot offer, once found', async () => {
    const blocked = { key: 'module:app', newest: '3.0.0', holds: [] };
    const updates = new UpdateState(() =>
      Promise.resolve({ ...finding(APP), blocked: new Map([['module:app', blocked]]) }),
    );
    expect(updates.blockedOf('module:app')).toBeUndefined();
    await updates.searchFor(OVERVIEW);

    expect(updates.blockedOf('module:app')).toBe(blocked);
    expect(updates.blockedOf('module:lib')).toBeUndefined();
  });

  test('explains the version looked at in a list, or else the one chosen, of a package with an update', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    await updates.searchFor(OVERVIEW);
    expect(updates.explainedOf('module:app')).toBeUndefined();
    expect(updates.explainedOf('module:other')).toBeUndefined();

    await updates.choose('module:app', '1.5.0');
    expect(updates.explainedOf('module:app')).toMatchObject({
      option: { version: '1.5.0' },
      installed: '1.0.0',
      previewing: false,
    });
    updates.setPreview('module:app', '2.0.0');
    expect(updates.explainedOf('module:app')).toMatchObject({ option: { version: '2.0.0' }, previewing: true });
    // Another list closing leaves this one's alone.
    updates.setPreview('module:lib', null);
    expect(updates.explainedOf('module:app')?.previewing).toBe(true);
    updates.setPreview('module:app', null);
    expect(updates.explainedOf('module:app')).toMatchObject({ option: { version: '1.5.0' }, previewing: false });
  });

  test('plans each choice with what it needs, refusing one the planner cannot complete', async () => {
    const planner = alone(APP, LIB);
    const plan = vi.spyOn(planner, 'plan');
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await expect(updates.optionsFor('module:app')).resolves.toEqual([]);
    await expect(updates.choose('module:app', '2.0.0')).resolves.toBe(false);
    await updates.searchFor(OVERVIEW);

    await expect(updates.choose('module:app', '2.0.0')).resolves.toBe(true);
    expect(updates.choices).toEqual([
      {
        key: 'module:app',
        installed: '1.0.0',
        chosen: '2.0.0',
        manifest: 'https://example.org/module:app/2.0.0/module.json',
      },
    ]);
    plan.mockResolvedValueOnce(undefined);
    await expect(updates.choose('module:lib', '1.1.0')).resolves.toBe(false);
    expect(updates.choices.map(({ key }) => key)).toEqual(['module:app']);
    // Not one no search offers.
    await expect(updates.choose('module:app', '9.0.0')).resolves.toBe(false);
    await expect(updates.choose('module:other', '1.0.0')).resolves.toBe(false);
  });

  test('names the choice that needs a change in the plan, and lists versions as the plan would have them', async () => {
    const planner = alone(APP, LIB);
    vi.spyOn(planner, 'plan').mockResolvedValue([
      { key: 'module:app', installed: '1.0.0', version: '2.0.0' },
      { key: 'module:lib', installed: '1.0.0', version: '1.1.0', by: { package: 'module:app', version: '2.0.0' } },
    ]);
    vi.spyOn(planner, 'complete').mockImplementation(picks =>
      Promise.resolve(
        picks.get('module:app') === '1.5.0'
          ? { ok: false }
          : { ok: true, versions: new Map([...picks, ['module:lib', '1.1.0']]) },
      ),
    );
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '2.0.0');

    expect(updates.choices[1]).toEqual({
      key: 'module:lib',
      installed: '1.0.0',
      chosen: '1.1.0',
      by: { title: 'module:app', version: '2.0.0' },
    });
    expect(updates.chosenOf('module:lib')).toBe('1.1.0');
    const options = await updates.optionsFor('module:app');
    expect(options.map(({ version }) => version)).toEqual(['2.0.0', '1.0.0']);
    updates.setPreview('module:app', '1.0.0');
    expect(updates.explainedOf('module:app')?.option).toBe(options[1]);
  });

  test('lists a version other choices stand in the way of, naming them, and leaves out one none does', async () => {
    const planner = alone(APP, LIB);
    vi.spyOn(planner, 'complete').mockImplementation(picks =>
      Promise.resolve(
        // App 1.5.0 cannot go with Library 1.1.0; App 2.0.0 cannot be had at all.
        (picks.get('module:app') === '1.5.0' && picks.get('module:lib') === '1.1.0') ||
          picks.get('module:app') === '2.0.0'
          ? { ok: false, explanation: ['Because of the library.'] }
          : { ok: true, versions: new Map(picks) },
      ),
    );
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:lib', '1.1.0');

    const options = await updates.optionsFor('module:app');

    expect(options.map(({ version }) => version)).toEqual(['1.5.0', '1.0.0']);
    expect(options[0]?.conflict).toEqual({
      remove: [{ title: 'module:lib', version: '1.1.0' }],
      explanation: ['Because of the library.'],
    });
    expect(options[0]?.badge?.text).toBe('module:app 1.5.0 with 1.1.0');
    expect(options[1]).not.toHaveProperty('conflict');
  });

  describe('installing anew', () => {
    /**
     * A planner that also knows Dice, not installed, once looked up.
     * @param fails - Whether it cannot take a set of choices
     * @param missing - Whether a version of Dice has no manifest URL of its own
     * @returns The planner
     */
    function withDice(
      fails: (picks: ReadonlyMap<string, string>) => boolean = () => false,
      missing: (version: string) => boolean = () => false,
    ): Planner {
      const base = alone(APP, LIB);
      return {
        ...base,
        add: vi.fn((key: string) => Promise.resolve(key === 'module:dice')),
        candidates: key => (key === 'module:dice' ? ['3.0.0', '2.0.0', '1.0.0'] : base.candidates(key)),
        complete: picks =>
          fails(picks) ? Promise.resolve({ ok: false, explanation: ['It will not fit.'] }) : base.complete(picks),
        missingManifest: (key, version) => key === 'module:dice' && missing(version),
      };
    }

    /**
     * The state, searched, with a planner that knows Dice.
     * @param planner - The planner
     * @returns The state
     */
    async function searchedWith(planner: Planner): Promise<UpdateState> {
      const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
      await updates.searchFor(OVERVIEW);
      return updates;
    }

    test('installs at the newest version the plan takes, passing over those without a manifest URL', async () => {
      const planner = withDice(
        picks => picks.get('module:dice') === '2.0.0',
        version => version === '3.0.0',
      );
      const updates = await searchedWith(planner);

      await expect(updates.install('module:dice', 'Dice', 'https://example.org/dice/module.json')).resolves.toEqual({
        ok: true,
        version: '1.0.0',
      });

      expect(updates.chosenOf('module:dice')).toBe('1.0.0');
      expect(planner.add).toHaveBeenCalledWith('module:dice', 'https://example.org/dice/module.json');
    });

    test('says why it cannot install: not now, not found, or no version fits', async () => {
      const updates = await searchedWith(withDice(() => true));
      await expect(updates.install('module:app')).resolves.toEqual({ ok: false, reason: 'It cannot be added now.' });
      await expect(new UpdateState(() => Promise.resolve(finding(APP))).install('module:dice')).resolves.toMatchObject({
        ok: false,
      });
      await expect(updates.install('module:none')).resolves.toEqual({
        ok: false,
        reason: 'EMMA found no releases of it.',
      });
      await expect(updates.install('module:dice')).resolves.toEqual({
        ok: false,
        reason: 'No version of it fits the installation and the plan.',
        explanation: ['It will not fit.'],
      });
      // Without words for why, none are given.
      const silent = await searchedWith({
        ...withDice(),
        complete: () => Promise.resolve({ ok: false }),
      });
      await expect(silent.install('module:dice')).resolves.toEqual({
        ok: false,
        reason: 'No version of it fits the installation and the plan.',
      });
      // None runs on the build, or none that does can be installed.
      const none = await searchedWith({ ...withDice(), candidates: () => [] });
      await expect(none.install('module:dice')).resolves.toEqual({
        ok: false,
        reason: "EMMA found releases of it, but none that it can tell runs on the plan's Foundry VTT build.",
      });
      const unmanifested = await searchedWith(withDice(undefined, () => true));
      await expect(unmanifested.install('module:dice')).resolves.toEqual({
        ok: false,
        reason:
          "The versions of it that run on the plan's Foundry VTT build give no manifest URL of their own to install from.",
      });
    });

    test('takes a package to install out of the plan, and nothing else', async () => {
      const updates = await searchedWith(withDice());
      await updates.install('module:dice');
      await updates.choose('module:app', '2.0.0');

      await expect(updates.forget('module:none')).resolves.toBe(false);
      await expect(updates.forget('module:dice')).resolves.toBe(true);

      expect(updates.picks).toEqual([['module:app', '2.0.0']]);
      await updates.forget('module:app');
      expect(updates.plan).toEqual([]);
      await expect(new UpdateState(() => Promise.resolve(finding(APP))).forget('module:app')).resolves.toBe(false);
    });

    test('looks a package to install up again for a new search, keeping it', async () => {
      const planner = withDice();
      const updates = await searchedWith(planner);
      await updates.install('module:dice');

      await updates.searchFor(OVERVIEW);

      expect(planner.add).toHaveBeenCalledTimes(3);
      expect(updates.chosenOf('module:dice')).toBe('3.0.0');
    });
  });

  describe('uninstalling', () => {
    /** App requires Library; Solo has no update on offer. */
    const INSTALLED = buildOverview(
      installation({
        modules: [
          installedModule('app', 'App', '1.0.0', { requires: ['lib'] }),
          installedModule('lib', 'Library', '1.0.0'),
          installedModule('solo', 'Solo', '3.0.0'),
        ],
      }),
      new Map(),
    );

    /**
     * The state, searched for the installation, with App and Library on offer.
     * @returns The state
     */
    async function searched(): Promise<UpdateState> {
      const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
      await updates.searchFor(INSTALLED);
      return updates;
    }

    test('offers nothing before a search, for Foundry VTT, or for a package not installed', async () => {
      expect(new UpdateState(() => Promise.resolve(finding(APP))).uninstallOf('module:app')).toBeUndefined();
      const updates = await searched();
      expect(updates.uninstallOf('core')).toBeUndefined();
      expect(updates.uninstallOf('module:none')).toBeUndefined();
      expect(updates.uninstallOf('system:none')).toBeUndefined();
      await expect(updates.choose('core', UNINSTALL)).resolves.toBe(false);
    });

    test('uninstalls a package, with an update or not, and takes it back by choosing the installed version', async () => {
      const updates = await searched();
      expect(updates.uninstallOf('system:dnd5e')).toMatchObject({ installed: '5.3.3', planned: false });

      await expect(updates.choose('module:solo', UNINSTALL)).resolves.toBe(true);

      expect(updates.uninstallOf('module:solo')).toEqual({
        installed: '3.0.0',
        effects: { blocks: [], warnings: [] },
        planned: true,
      });
      expect(updates.chosenOf('module:solo')).toBe(UNINSTALL);
      expect(updates.choices).toContainEqual(expect.objectContaining({ key: 'module:solo', chosen: UNINSTALL }));

      await expect(updates.choose('module:solo', '3.0.0')).resolves.toBe(true);
      expect(updates.plan).toEqual([]);
    });

    test('refuses an uninstall that would break something, until what breaks is uninstalled too', async () => {
      const updates = await searched();
      expect(updates.uninstallOf('module:lib')?.effects.blocks).toEqual([{ kind: 'required', by: 'App' }]);

      await expect(updates.choose('module:lib', UNINSTALL)).resolves.toBe(false);
      await expect(updates.choose('module:app', UNINSTALL)).resolves.toBe(true);
      expect(updates.uninstallOf('module:lib')?.effects.blocks).toEqual([]);
      await expect(updates.choose('module:lib', UNINSTALL)).resolves.toBe(true);

      // Keeping App would break Library's uninstall, so it is refused while Library's stands.
      await expect(updates.choose('module:app', '1.0.0')).resolves.toBe(false);
      await expect(updates.forget('module:app')).resolves.toBe(false);
      expect(updates.chosenOf('module:app')).toBe(UNINSTALL);
    });

    test('keeps an uninstall through a new search while the package is installed and may still go', async () => {
      const updates = await searched();
      await updates.choose('module:solo', UNINSTALL);

      await updates.searchFor(INSTALLED);
      expect(updates.chosenOf('module:solo')).toBe(UNINSTALL);

      // Gone, it is dropped.
      const without = buildOverview(
        installation({
          modules: INSTALLED.modules.map(({ module: installed }) => installed).filter(({ id }) => id !== 'solo'),
        }),
        new Map(),
      );
      await updates.searchFor(without);
      expect(updates.plan).toEqual([]);
    });

    test('drops the uninstalls a new search finds would break something', async () => {
      const updates = await searched();
      await updates.choose('module:solo', UNINSTALL);
      await updates.choose('module:app', '2.0.0');
      // Since read, App requires Solo.
      const needing = buildOverview(
        installation({
          modules: [
            installedModule('app', 'App', '1.0.0', { requires: ['lib', 'solo'] }),
            installedModule('lib', 'Library', '1.0.0'),
            installedModule('solo', 'Solo', '3.0.0'),
          ],
        }),
        new Map(),
      );

      await updates.searchFor(needing);

      expect(updates.picks).toEqual([['module:app', '2.0.0']]);
    });
  });

  describe('newerCore', () => {
    const CORE: PackageUpdate = {
      key: 'core',
      installed: '14.368',
      newest: '15.300',
      versions: ['15.300', '14.370', '14.369', '14.368'],
    };

    /**
     * The state, with Foundry VTT and the library on offer, and some choices made.
     * @param fails - Whether the planner cannot take a set of choices
     * @param choices - The choices, in order
     * @returns The state
     */
    async function choosing(
      fails: (picks: ReadonlyMap<string, string>) => boolean,
      ...choices: readonly (readonly [string, string])[]
    ): Promise<UpdateState> {
      const planner = alone(CORE, LIB);
      const complete = planner.complete.bind(planner);
      vi.spyOn(planner, 'complete').mockImplementation(picks =>
        fails(picks) ? Promise.resolve({ ok: false }) : complete(picks),
      );
      const updates = new UpdateState(() => Promise.resolve({ ...finding(CORE, LIB), planner }));
      await updates.searchFor(OVERVIEW);
      for (const [key, version] of choices) await updates.choose(key, version);
      return updates;
    }

    test('gives nothing before a search, without Foundry VTT in the plan, or with its newest build', async () => {
      expect(await new UpdateState(() => Promise.resolve(finding(CORE))).newerCore()).toBeUndefined();
      expect(await (await choosing(() => false, ['module:lib', '1.1.0'])).newerCore()).toBeUndefined();
      expect(await (await choosing(() => false, ['core', '14.370'])).newerCore()).toBeUndefined();
      // A new generation is installed only by hand, so its newest build is the newest of its own.
      expect(await (await choosing(() => false, ['core', '15.300'])).newerCore()).toBeUndefined();
    });

    test("gives the newest build of the chosen one's generation, which the plan can take", async () => {
      const updates = await choosing(() => false, ['core', '14.369']);

      expect(await updates.newerCore()).toEqual({ kind: 'coherent', version: '14.370' });
    });

    test('names the choices without which the plan could take it', async () => {
      // 14.370 cannot go with Library 1.1.0.
      const updates = await choosing(
        picks => picks.get('core') === '14.370' && picks.get('module:lib') === '1.1.0',
        ['core', '14.369'],
        ['module:lib', '1.1.0'],
      );

      expect(await updates.newerCore()).toEqual({
        kind: 'conflict',
        version: '14.370',
        remove: [{ title: 'module:lib', version: '1.1.0' }],
      });
    });

    test('says when the plan cannot take it, whatever is taken out', async () => {
      const updates = await choosing(picks => picks.get('core') === '14.370', ['core', '14.369']);

      expect(await updates.newerCore()).toEqual({ kind: 'unavailable', version: '14.370' });
    });
  });

  test('plans the choices again for a new search, dropping them if it cannot, and keeps only the latest', async () => {
    const planner = alone(APP, LIB);
    const answers: ((search: UpdateSearch) => void)[] = [];
    const updates = new UpdateState(
      () =>
        new Promise<UpdateSearch>(resolve => {
          answers.push(resolve);
        }),
    );
    const first = updates.searchFor(OVERVIEW);
    answers[0]?.({ ...finding(APP, LIB), planner });
    await first;
    await updates.choose('module:app', '2.0.0');

    // A search that plans them again, overtaken by another while it does.
    let replan: (entries: undefined) => void = () => undefined;
    const slow = alone(APP, LIB);
    const slowPlan = vi.spyOn(slow, 'plan').mockReturnValue(
      new Promise(resolve => {
        replan = resolve;
      }),
    );
    const second = updates.searchFor(OVERVIEW);
    answers[1]?.({ ...finding(APP, LIB), planner: slow });
    await vi.waitFor(() => {
      expect(slowPlan).toHaveBeenCalled();
    });
    const third = updates.searchFor(OVERVIEW);
    answers[2]?.({ ...finding(APP, LIB), planner });
    await third;
    replan(undefined);
    await second;
    expect(updates.choices.map(({ chosen }) => chosen)).toEqual(['2.0.0']);

    // One that cannot plan them drops them.
    const refuses = alone(APP, LIB);
    vi.spyOn(refuses, 'plan').mockResolvedValue(undefined);
    const fourth = updates.searchFor(OVERVIEW);
    answers[3]?.({ ...finding(APP, LIB), planner: refuses });
    await fourth;
    expect(updates.choices).toEqual([]);
  });

  test('badges a version with the other packages at the versions chosen, or none before a search', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    expect(updates.optionOf('module:app', '2.0.0')).toEqual({ version: '2.0.0', badge: null });
    await updates.searchFor(OVERVIEW);

    expect(updates.optionOf('module:app', '2.0.0').badge?.text).toBe('module:app 2.0.0 with 1.0.0');
    await updates.choose('module:lib', '1.1.0');
    expect(updates.optionOf('module:app', '2.0.0').badge?.text).toBe('module:app 2.0.0 with 1.1.0');
  });

  test('keeps a failure rather than throwing it', async () => {
    const updates = new UpdateState(() => Promise.reject(new Error('offline')));

    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('failed');
  });

  test("keeps only the latest search's answer", async () => {
    const answers: ((search: UpdateSearch) => void)[] = [];
    const failures: ((error: Error) => void)[] = [];
    const updates = new UpdateState(
      () =>
        new Promise((resolve, reject) => {
          answers.push(resolve);
          failures.push(reject);
        }),
    );

    const first = updates.searchFor(OVERVIEW);
    const second = updates.searchFor(OVERVIEW);
    answers[1]?.(finding(LIB));
    await second;
    answers[0]?.(finding(APP));
    await first;
    expect(updates.updateOf('module:lib')).toBe(LIB);
    expect(updates.updateOf('module:app')).toBeUndefined();

    const third = updates.searchFor(OVERVIEW);
    const fourth = updates.searchFor(OVERVIEW);
    answers[3]?.(finding(LIB));
    await fourth;
    failures[2]?.(new Error('late'));
    await third;
    expect(updates.status).toBe('found');
  });

  test('keeps the versions chosen that differ from the installed ones', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    await updates.searchFor(OVERVIEW);

    await updates.choose('module:lib', '1.1.0');
    await updates.choose('module:app', '1.5.0');
    // Neither a version not offered, nor a package without an update.
    await updates.choose('module:app', '9.0.0');
    await updates.choose('module:other', '1.0.0');

    expect(updates.choices).toEqual([
      {
        key: 'module:lib',
        installed: '1.0.0',
        chosen: '1.1.0',
        manifest: 'https://example.org/module:lib/1.1.0/module.json',
      },
      {
        key: 'module:app',
        installed: '1.0.0',
        chosen: '1.5.0',
        manifest: 'https://example.org/module:app/1.5.0/module.json',
      },
    ]);
    expect(updates.chosenOf('module:app')).toBe('1.5.0');

    await updates.choose('module:lib', '1.0.0');
    expect(updates.choices.map(({ key }) => key)).toEqual(['module:app']);

    updates.clear();
    expect(updates.choices).toEqual([]);
  });

  test('drops a choice a new search no longer offers', async () => {
    let found = finding(APP, LIB);
    const updates = new UpdateState(() => Promise.resolve(found));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '2.0.0');
    await updates.choose('module:lib', '1.1.0');

    found = finding({ ...APP, newest: '1.5.0', versions: ['1.5.0', '1.0.0'] }, LIB);
    await updates.searchFor(OVERVIEW);

    expect(updates.choices.map(({ key }) => key)).toEqual(['module:lib']);
  });

  test('says why a search cannot be made, dropping what was found and chosen, until one can again', async () => {
    let unavailable = false;
    const updates = new UpdateState(() =>
      unavailable
        ? Promise.reject(new KitUnavailable({ reason: 'module-too-old', version: '0.9.0' }))
        : Promise.resolve(finding(APP)),
    );
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '2.0.0');

    unavailable = true;
    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('unavailable');
    expect(updates.problem).toEqual({ reason: 'module-too-old', version: '0.9.0' });
    expect(updates.search).toBeNull();
    expect(updates.choices).toEqual([]);

    unavailable = false;
    await updates.searchFor(OVERVIEW);

    expect(updates.status).toBe('found');
    expect(updates.problem).toBeNull();
  });

  test('keeps only the latest search when an earlier one cannot be made', async () => {
    let refuse: (error: unknown) => void = () => undefined;
    const first = new Promise<UpdateSearch>((_resolve, reject) => {
      refuse = reject;
    });
    const searches = [first, Promise.resolve(finding(APP))];
    const updates = new UpdateState(() => searches.shift() ?? Promise.resolve(finding()));

    const earlier = updates.searchFor(OVERVIEW);
    await updates.searchFor(OVERVIEW);
    refuse(new KitUnavailable({ reason: 'missing' }));
    await earlier;

    expect(updates.status).toBe('found');
    expect(updates.problem).toBeNull();
  });

  test('offers no snapshot or backup before it has searched', () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));

    expect(updates.safeguards).toEqual([]);
  });

  test('names a package by its title in the installation, or by its key', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP)));
    expect(updates.titleOf('core')).toBe('Foundry VTT');
    expect(updates.titleOf('system:dnd5e')).toBe('system:dnd5e');

    await updates.searchFor(OVERVIEW);

    expect(updates.titleOf('system:dnd5e')).toBe('D&D 5e');
    expect(updates.titleOf('module:gone')).toBe('module:gone');
  });
});

describe('installing from a manifest URL', () => {
  const DICE_URL = 'https://example.org/dice/module.json';
  const DICE = {
    ...release('module:dice', '1.2.0', { requires: { lib: {} } }),
    manifest: DICE_URL,
    versionManifest: DICE_URL,
  };

  /**
   * The state, searched, with a planner that knows Dice once it is included, and takes it unless told not to.
   * @param read - What reading the manifest finds
   * @param refuse - Whether the plan cannot take Dice
   * @returns The state, and the planner
   */
  async function searched(read: ManifestRead, refuse = false) {
    const base = alone(APP, LIB);
    let known = false;
    const planner: Planner = {
      ...base,
      include: vi.fn(() => {
        known = true;
      }),
      add: vi.fn((key: string) => Promise.resolve(key === 'module:dice' ? known : key === 'module:lib')),
      candidates: key => (key === 'module:dice' && known ? ['1.2.0'] : base.candidates(key)),
      complete: picks =>
        refuse && picks.has('module:dice')
          ? Promise.resolve({ ok: false, explanation: ['Dice needs a newer Foundry VTT.'] })
          : base.complete(picks),
    };
    const updates = new UpdateState(() =>
      Promise.resolve({ ...finding(APP, LIB), planner, readManifest: () => Promise.resolve(read) }),
    );
    await updates.searchFor(OVERVIEW);
    return { updates, planner };
  }

  test('adds the version a manifest gives, looking up what it requires', async () => {
    const { updates, planner } = await searched({ ok: true, release: DICE, title: 'Dice' });

    await expect(updates.installFrom(DICE_URL, 'module')).resolves.toEqual({
      ok: true,
      title: 'Dice',
      version: '1.2.0',
    });

    expect(planner.include).toHaveBeenCalledWith([DICE]);
    expect(planner.add).toHaveBeenCalledWith('module:lib', undefined);
    expect(updates.picks).toEqual([['module:dice', '1.2.0']]);
    expect(updates.titleOf('module:dice')).toBe('Dice');
    // Already in the plan, it is not added again.
    await expect(updates.installFrom(DICE_URL, 'module')).resolves.toEqual({
      ok: false,
      reason: 'Dice is in the plan already.',
    });
  });

  test('says why a manifest cannot be added', async () => {
    const unread = { ok: false, problem: 'unreadable', host: 'example.org' } as const;
    const reasons = await Promise.all(
      (
        [
          { ...unread, reason: 'http', status: 404 },
          { ...unread, reason: 'http' },
          { ...unread, reason: 'network' },
          { ...unread, reason: 'refused' },
          { ...unread, reason: 'too-large' },
          { ...unread, reason: 'invalid' },
          { ok: false, problem: 'no-catalogue' },
          { ok: false, problem: 'not-manifest' },
          { ok: false, problem: 'other-type', type: 'module' },
        ] satisfies ManifestRead[]
      ).map(async read => {
        const result = await (await searched(read)).updates.installFrom(DICE_URL, 'system');
        return result.ok ? '' : result.reason;
      }),
    );
    expect(reasons).toEqual([
      'example.org answered 404, not the manifest.',
      'example.org answered , not the manifest.',
      'example.org could not be reached.',
      "EMMA's catalogue does not read from example.org: it reads only public web addresses, with few redirects.",
      'What the URL gives is too large to be a manifest.',
      "What the URL gives is not a manifest's JSON.",
      "EMMA's catalogue, which reads the manifest, could not be reached. Try again later.",
      "That is not a game system's or module's manifest.",
      "That is a module's manifest, not a game system's.",
    ]);

    const { updates } = await searched({ ok: false, problem: 'other-type', type: 'system' });
    await expect(updates.installFrom(DICE_URL, 'module')).resolves.toEqual({
      ok: false,
      reason: "That is a game system's manifest, not a module's.",
    });
    const installed = await searched({
      ok: true,
      release: { ...DICE, package: { type: 'module', id: 'app' } },
      title: 'App',
    });
    await expect(installed.updates.installFrom(DICE_URL, 'module')).resolves.toEqual({
      ok: false,
      reason: 'App is installed already: its updates are offered in the installation tree.',
    });
    // Without a search, or a way to read manifests, none is read.
    await expect(new UpdateState(() => Promise.resolve(finding(APP))).installFrom(DICE_URL, 'module')).resolves.toEqual(
      {
        ok: false,
        reason: 'It cannot be added now.',
      },
    );
  });

  test('adds one the plan cannot take against advice, outside what it resolves, until taken out', async () => {
    const { updates } = await searched({ ok: true, release: DICE, title: 'Dice' }, true);
    await updates.choose('module:app', UNINSTALL);

    const refused = await updates.installFrom(DICE_URL, 'module');
    expect(refused).toEqual({
      ok: false,
      reason: 'The plan cannot take it.',
      explanation: ['Dice needs a newer Foundry VTT.'],
      override: { key: 'module:dice', title: 'Dice', version: '1.2.0', manifest: DICE_URL },
    });
    if (refused.ok || refused.override === undefined) throw new Error('No override');

    expect(updates.force(refused.override)).toBe(true);
    expect(updates.picks).toEqual([['module:app', UNINSTALL]]);
    expect(updates.forced).toEqual([refused.override]);
    expect(updates.choices.at(-1)).toEqual({ key: 'module:dice', chosen: '1.2.0', manifest: DICE_URL, forced: true });
    // It is installed before the uninstalls.
    expect(updates.runPlan.map(({ key }) => key)).toEqual(['module:dice', 'module:app']);
    // It stops nothing else being planned, and stays through a new search.
    await expect(updates.choose('module:lib', '1.1.0')).resolves.toBe(true);
    await updates.searchFor(OVERVIEW);
    expect(updates.forced).toHaveLength(1);

    updates.unforce('module:dice');
    expect(updates.forced).toEqual([]);
    expect(updates.force(refused.override)).toBe(true);
    updates.clear();
    expect(updates.forced).toEqual([]);
  });

  test('takes the place of the same package in the plan, and goes once it is installed', async () => {
    const { updates } = await searched({ ok: true, release: DICE, title: 'Dice' });
    const forced = { key: 'module:lib', title: 'Library', version: '9.0.0', manifest: DICE_URL };
    await updates.choose('module:lib', '1.1.0');

    // LIB is installed, so cannot be added against advice, nor anything while the plan runs.
    expect(updates.force(forced)).toBe(false);
    updates.locked = true;
    expect(updates.force({ ...forced, key: 'module:dice' })).toBe(false);
    updates.locked = false;
    // Dice in the plan at 1.2.0, then against advice at 9.0.0: the plan shows and runs 9.0.0 alone.
    await expect(updates.installFrom(DICE_URL, 'module')).resolves.toMatchObject({ ok: true });
    expect(updates.choices.filter(({ key }) => key === 'module:dice')).toHaveLength(1);
    expect(updates.force({ ...forced, key: 'module:dice' })).toBe(true);
    expect(updates.choices.filter(({ key }) => key === 'module:dice')).toEqual([
      { key: 'module:dice', chosen: '9.0.0', manifest: DICE_URL, forced: true },
    ]);
    expect(updates.runPlan.filter(({ key }) => key === 'module:dice')).toEqual([
      { key: 'module:dice', version: '9.0.0', manifest: DICE_URL, forced: true },
    ]);

    const now = buildOverview(installation({ modules: [installedModule('dice', 'Dice', '9.0.0')] }), new Map());
    await updates.searchFor(now);
    expect(updates.forced).toEqual([]);
  });
});

describe('taking a change out of the plan', () => {
  const TOOL: PackageUpdate = { key: 'module:tool', installed: '1.0.0', newest: '3.0.0', versions: ['3.0.0', '1.0.0'] };
  const MAPS: PackageUpdate = { key: 'module:maps', installed: '1.0.0', newest: '2.0.0', versions: ['2.0.0', '1.0.0'] };

  /**
   * The state, searched, with a planner in which App 2.0.0 and Tool 3.0.0 each need Library 1.1.0, and Library 1.1.0
   * needs Maps 2.0.0, unless chosen.
   * @returns The state
   */
  async function searched(): Promise<UpdateState> {
    const base = alone(APP, LIB, TOOL, MAPS);
    const planner: Planner = {
      ...base,
      plan: picks => {
        const entries: PlanEntry[] = [...picks].map(([key, version]) => ({ key, installed: '1.0.0', version }));
        const needer = [...picks].find(
          ([key, version]) => (key === 'module:app' && version === '2.0.0') || key === 'module:tool',
        );
        if (needer !== undefined && !picks.has('module:lib')) {
          entries.push({
            key: 'module:lib',
            installed: '1.0.0',
            version: '1.1.0',
            by: { package: needer[0], version: needer[1] },
          });
        }
        if ((needer !== undefined || picks.get('module:lib') === '1.1.0') && !picks.has('module:maps')) {
          entries.push({
            key: 'module:maps',
            installed: '1.0.0',
            version: '2.0.0',
            by: { package: 'module:lib', version: '1.1.0' },
          });
        }
        return Promise.resolve(entries);
      },
    };
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB, TOOL, MAPS), planner }));
    await updates.searchFor(OVERVIEW);
    return updates;
  }

  /**
   * What the plan holds.
   * @param updates - The state
   * @returns Each change as `<key>@<version>`, with `<` and its needer if another needs it
   */
  const held = (updates: UpdateState) =>
    updates.plan.map(({ key, version, by }) => `${key}@${version}${by === undefined ? '' : ` < ${by.package}`}`);

  test('takes a change out alone, keeping what it brought in, chosen as the plan has it', async () => {
    const updates = await searched();
    await updates.choose('module:app', '2.0.0');
    expect(held(updates)).toEqual([
      'module:app@2.0.0',
      'module:lib@1.1.0 < module:app',
      'module:maps@2.0.0 < module:lib',
    ]);
    // What another change needs cannot be taken out by itself.
    expect(updates.canTakeOut('module:app')).toBe(true);
    expect(updates.canTakeOut('module:lib')).toBe(false);
    await expect(updates.takeOut('module:lib', false)).resolves.toBe(false);

    await expect(updates.takeOut('module:app', false)).resolves.toBe(true);

    // Regression: Maps, which Library needs, was kept as chosen too, so offered as if it could be taken out alone.
    expect(updates.picks).toEqual([['module:lib', '1.1.0']]);
    expect(held(updates)).toEqual(['module:lib@1.1.0', 'module:maps@2.0.0 < module:lib']);
    expect(updates.canTakeOut('module:maps')).toBe(false);
  });

  test('takes a change out with what it brought in, but for what another change still needs', async () => {
    const updates = await searched();
    await updates.choose('module:app', '2.0.0');
    await expect(updates.takeOut('module:app', true)).resolves.toBe(true);
    expect(updates.plan).toEqual([]);

    await updates.choose('module:app', '2.0.0');
    await updates.choose('module:tool', '3.0.0');
    await expect(updates.takeOut('module:app', true)).resolves.toBe(true);
    expect(held(updates)).toEqual([
      'module:tool@3.0.0',
      'module:lib@1.1.0 < module:tool',
      'module:maps@2.0.0 < module:lib',
    ]);
  });

  test('takes a change in a ring of changes that need each other out with them, as alone it would come back', async () => {
    // Midi 2.0.0 needs DAE 2.0.0, which needs D&D 5e 6.0.0, which needs Midi 2.0.0: any one brings in the others.
    const RING = ['module:midi', 'module:dae', 'system:dnd5e'];
    const AT: Readonly<Record<string, string>> = {
      'module:midi': '2.0.0',
      'module:dae': '2.0.0',
      'system:dnd5e': '6.0.0',
    };
    const base = alone(APP);
    const planner: Planner = {
      ...base,
      candidates: key => (AT[key] === undefined ? base.candidates(key) : [AT[key]]),
      plan: picks => {
        const chosen = [...picks.keys()];
        const first = chosen.find(key => RING.includes(key));
        const entries: PlanEntry[] = chosen.map(key => ({ key, installed: '1.0.0', version: picks.get(key) ?? '' }));
        if (first !== undefined) {
          for (const key of RING.filter(other => !picks.has(other))) {
            entries.push({
              key,
              installed: '1.0.0',
              version: AT[key] ?? '',
              by: { package: first, version: AT[first] ?? '' },
            });
          }
        }
        return Promise.resolve(entries);
      },
    };
    const MIDI: PackageUpdate = {
      key: 'module:midi',
      installed: '1.0.0',
      newest: '2.0.0',
      versions: ['2.0.0', '1.0.0'],
    };
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, MIDI), planner }));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:midi', '2.0.0');
    await updates.choose('module:app', '2.0.0');
    expect(updates.plan.map(({ key }) => key)).toEqual(['module:midi', 'module:app', 'module:dae', 'system:dnd5e']);

    await expect(updates.takeOut('module:midi', false)).resolves.toBe(true);

    expect(updates.picks).toEqual([['module:app', '2.0.0']]);
    expect(updates.plan.map(({ key }) => key)).toEqual(['module:app']);
  });

  test('takes out what was added against advice, and nothing while the plan runs', async () => {
    const updates = await searched();
    const install = { key: 'module:dice', title: 'Dice', version: '1.0.0', manifest: 'https://example.org/dice.json' };
    updates.force(install);
    expect(updates.canTakeOut('module:dice')).toBe(true);
    await expect(updates.takeOut('module:dice', false)).resolves.toBe(true);
    expect(updates.forced).toEqual([]);

    await updates.choose('module:app', '2.0.0');
    updates.force(install);
    updates.locked = true;
    await expect(updates.takeOut('module:app', false)).resolves.toBe(false);
    await expect(updates.takeOut('module:dice', true)).resolves.toBe(false);
    expect(updates.forced).toHaveLength(1);
  });
});

describe('what a module recommends', () => {
  const DICE_URL = 'https://example.org/dice/module.json';

  /**
   * The state, searched, with a planner in which App recommends Dice, not installed, and Library, installed.
   * @returns The state, and the planner
   */
  async function searched() {
    const base = alone(APP, LIB);
    let diceKnown = false;
    let diceGone = false;
    const planner: Planner = {
      ...base,
      recommendsOf: key =>
        // Given out of order, to be sorted by title.
        key === 'module:app' ? [{ key: 'module:lib' }, { key: 'module:dice', manifest: DICE_URL }] : [],
      add: vi.fn((key: string) => {
        if (key === 'module:dice') diceKnown = true;
        return Promise.resolve(key !== 'module:dice' || diceKnown);
      }),
      candidates: key => (key === 'module:dice' ? (diceKnown && !diceGone ? ['1.0.0'] : []) : base.candidates(key)),
    };
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP, LIB), planner }));
    await updates.searchFor(OVERVIEW);
    /** Make Dice no longer found, as by a search that does not find it again. */
    const lose = () => {
      diceGone = true;
    };
    return { updates, planner, lose };
  }

  test('says what a module recommends, whether installed, and whether wanted', async () => {
    const { updates } = await searched();
    await updates.setRecommended('module:app', 'module:dice', true);

    expect(updates.recommendationsOf('module:app')).toEqual([
      { key: 'module:dice', title: 'dice', installed: false, wanted: true },
      // Installed, it is as good as wanted.
      { key: 'module:lib', title: 'lib', installed: true, wanted: true },
    ]);
    expect(updates.recommendationsOf('module:none')).toEqual([]);
    expect(new UpdateState(() => Promise.resolve(finding(APP))).recommendationsOf('module:app')).toEqual([]);
  });

  test('brings in what is wanted with a module as it is chosen, and takes it out with it', async () => {
    const { updates, planner } = await searched();
    await updates.setRecommended('module:app', 'module:dice', true);
    // Library is installed, so is not brought in.
    await updates.setRecommended('module:app', 'module:lib', true);

    await updates.choose('module:app', '2.0.0');

    expect(planner.add).toHaveBeenCalledWith('module:dice', DICE_URL);
    expect(new Map(updates.picks)).toEqual(
      new Map([
        ['module:app', '2.0.0'],
        ['module:dice', '1.0.0'],
      ]),
    );
    expect(updates.choices.find(({ key }) => key === 'module:dice')).toMatchObject({ recommendedBy: 'module:app' });

    await updates.takeOut('module:app', false);
    expect(updates.picks).toEqual([]);
  });

  test('brings it in when wanted with a module in the plan, and takes it out when no longer wanted', async () => {
    const { updates } = await searched();
    await updates.choose('module:app', '2.0.0');
    expect(updates.picks).toEqual([['module:app', '2.0.0']]);

    await updates.setRecommended('module:app', 'module:dice', true);
    expect(updates.picks).toContainEqual(['module:dice', '1.0.0']);

    await updates.setRecommended('module:app', 'module:dice', false);
    expect(updates.picks).toEqual([['module:app', '2.0.0']]);
    // Unwanting what did not come in on the recommendation changes nothing.
    await updates.setRecommended('module:app', 'module:lib', false);
    expect(updates.picks).toEqual([['module:app', '2.0.0']]);
  });

  test('forgets what came in on a recommendation once a search no longer finds it', async () => {
    const { updates, lose } = await searched();
    await updates.setRecommended('module:app', 'module:dice', true);
    await updates.choose('module:app', '2.0.0');

    lose();
    await updates.searchFor(OVERVIEW);
    expect(updates.picks).toEqual([['module:app', '2.0.0']]);
  });

  test('changes nothing while the plan runs, and forgets what came in once the plan is cleared or searched again', async () => {
    const { updates } = await searched();
    updates.locked = true;
    await updates.setRecommended('module:app', 'module:dice', true);
    expect(updates.recommendationsOf('module:app')[0]).toMatchObject({ wanted: false });
    updates.locked = false;

    await updates.setRecommended('module:app', 'module:dice', true);
    await updates.choose('module:app', '2.0.0');
    await updates.searchFor(OVERVIEW);
    expect(updates.choices.find(({ key }) => key === 'module:dice')).toMatchObject({ recommendedBy: 'module:app' });
    updates.clear();
    expect(updates.choices).toEqual([]);
    await expect(updates.planBest()).resolves.toBe(true);
  });
});

describe('what a module to install requires and recommends', () => {
  const NEW_URL = 'https://example.org/new/module.json';
  const NEW = {
    ...release('module:new', '1.0.0', { requires: { lib: {} } }),
    relationships: {
      requires: [
        { package: { type: 'module' as const, id: 'lib' }, compatibility: {} },
        { package: { type: 'system' as const, id: 'dnd5e' }, compatibility: {} },
      ],
      systems: [],
      conflicts: [],
      recommends: [
        {
          package: { type: 'module' as const, id: 'dice' },
          compatibility: {},
          manifest: 'https://example.org/dice.json',
        },
        { package: { type: 'module' as const, id: 'new' }, compatibility: {} },
      ],
    },
  };

  /**
   * The state, searched, with a planner that can add New, not installed, which recommends Dice and Maps; Maps can be
   * added, Dice cannot be found.
   * @returns The state
   */
  async function searched() {
    const base = alone(APP, LIB);
    const known = new Set<string>();
    const planner: Planner = {
      ...base,
      recommendsOf: key => (key === 'module:new' ? [{ key: 'module:dice' }, { key: 'module:maps' }] : []),
      add: key => {
        if (key !== 'module:dice') known.add(key);
        return Promise.resolve(known.has(key) || key === 'module:app' || key === 'module:lib');
      },
      candidates: key => (known.has(key) ? ['1.0.0'] : base.candidates(key)),
    };
    const updates = new UpdateState(() =>
      Promise.resolve({
        ...finding(APP, LIB),
        planner,
        readManifest: (url: string) =>
          Promise.resolve(
            url === NEW_URL
              ? { ok: true as const, release: NEW, title: 'New' }
              : { ok: false as const, problem: 'not-manifest' as const },
          ),
      }),
    );
    await updates.searchFor(OVERVIEW);
    return updates;
  }

  test('reads them from the manifest it would be installed from, but for systems and itself', async () => {
    const updates = await searched();

    await expect(updates.relationsOf(NEW_URL, 'module')).resolves.toEqual({
      requires: ['module:lib'],
      recommends: [{ key: 'module:dice', manifest: 'https://example.org/dice.json' }],
    });
    await expect(updates.relationsOf('https://example.org/other.json', 'module')).resolves.toBeUndefined();
    await expect(
      new UpdateState(() => Promise.resolve(finding(APP))).relationsOf(NEW_URL, 'module'),
    ).resolves.toBeUndefined();
    expect(updates.isInstalled('module:app')).toBe(true);
    expect(updates.isInstalled('module:new')).toBe(false);
  });

  test('wants every recommendation while always wanted, but for those unticked', async () => {
    const updates = await searched();
    expect(updates.wants('module:new', 'module:maps')).toBe(false);

    updates.alwaysRecommended = true;
    expect(updates.wants('module:new', 'module:maps')).toBe(true);
    await updates.setRecommended('module:new', 'module:dice', false);
    expect(updates.wants('module:new', 'module:dice')).toBe(false);
    await updates.setRecommended('module:new', 'module:dice', true);
    expect(updates.wants('module:new', 'module:dice')).toBe(true);
  });

  test('unticks a recommendation that cannot come into the plan with its module, saying why, until ticked again', async () => {
    const updates = await searched();
    await expect(updates.install('module:new', 'New')).resolves.toMatchObject({ ok: true });

    await updates.setRecommended('module:new', 'module:dice', true);

    expect(updates.picks).toEqual([['module:new', '1.0.0']]);
    expect(updates.wants('module:new', 'module:dice')).toBe(false);
    expect(updates.rejectionOf('module:new', 'module:dice')).toEqual({
      ok: false,
      reason: 'EMMA found no releases of it.',
    });
    expect(updates.recommendationsOf('module:new').find(({ key }) => key === 'module:dice')).toMatchObject({
      wanted: false,
      rejected: { reason: 'EMMA found no releases of it.' },
    });
    // Unticked by hand, the reason goes.
    await updates.setRecommended('module:new', 'module:dice', false);
    expect(updates.rejectionOf('module:new', 'module:dice')).toBeUndefined();
  });

  test('unticks one that cannot come in as its module is chosen, the module coming in all the same', async () => {
    const updates = await searched();
    await updates.setRecommended('module:new', 'module:dice', true);
    await updates.setRecommended('module:new', 'module:maps', true);
    // Found by an install of it first, as the Install section would.
    await expect(updates.install('module:maps', 'Maps')).resolves.toMatchObject({ ok: true });
    await updates.forget('module:maps');

    await updates.choose('module:new', '1.0.0');

    expect(new Map(updates.picks)).toEqual(
      new Map([
        ['module:new', '1.0.0'],
        ['module:maps', '1.0.0'],
      ]),
    );
    expect(updates.rejectionOf('module:new', 'module:dice')).toMatchObject({ ok: false });
    expect(updates.rejectionOf('module:new', 'module:maps')).toBeUndefined();
  });

  test('installs it with what it recommends that is wanted, or not at all where one cannot be added', async () => {
    const updates = await searched();
    updates.alwaysRecommended = true;

    const blocked = await updates.install('module:new', 'New');
    expect(blocked).toEqual({
      ok: false,
      reason: 'What it recommends cannot be added with it: dice. Untick it in the drawer to add the module without it.',
    });
    expect(updates.picks).toEqual([]);

    await updates.setRecommended('module:new', 'module:dice', false);
    await expect(updates.install('module:new', 'New')).resolves.toEqual({ ok: true, version: '1.0.0' });
    expect(new Map(updates.picks)).toEqual(
      new Map([
        ['module:new', '1.0.0'],
        ['module:maps', '1.0.0'],
      ]),
    );
  });
});

describe("the user's changes to the plan", () => {
  test('are counted as they choose, take out, add against advice and clear, but not as a search finds', async () => {
    const updates = new UpdateState(() => Promise.resolve(finding(APP, LIB)));
    await updates.searchFor(OVERVIEW);
    expect(updates.changes).toBe(0);

    await updates.choose('module:app', '2.0.0');
    expect(updates.changes).toBe(1);
    await updates.searchFor(OVERVIEW);
    expect(updates.changes).toBe(1);
    await updates.takeOut('module:app', true);
    const install = { key: 'module:dice', title: 'Dice', version: '1.0.0', manifest: 'https://example.org/dice.json' };
    updates.force(install);
    updates.unforce('module:dice');
    // Taking out what is not there is no change.
    updates.unforce('module:dice');
    updates.force(install);
    await updates.takeOut('module:dice', false);
    updates.clear();
    await updates.planBest();
    expect(updates.changes).toBe(8);
  });
});

describe('what the catalogue says of a search', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * What the catalogue says, with a recheck that answers.
   * @param more - What else it says
   * @returns What it says
   */
  const said = (more: Partial<CatalogueState> = {}): CatalogueState => ({
    reached: true,
    pending: [],
    checkedAt: null,
    recheck: vi.fn(() => Promise.resolve(true)),
    ...more,
  });

  test('searches once more for the packages it was fetching, once it says they may be found', async () => {
    vi.useFakeTimers();
    const pending = said({ pending: ['module:new'], retryAfter: 30 });
    const search = vi.fn(() => Promise.resolve({ ...finding(APP), catalogue: pending }));
    const updates = new UpdateState(search);

    await updates.searchFor(OVERVIEW);
    expect(search).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(search).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledTimes(2);
    // Only once: still pending, they are not searched for again.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(search).toHaveBeenCalledTimes(2);
    expect(updates.status).toBe('found');
  });

  test('searches not once more while a plan runs, nor after a search of its own', async () => {
    vi.useFakeTimers();
    const search = vi.fn(() =>
      Promise.resolve({ ...finding(APP), catalogue: said({ pending: ['module:new'], retryAfter: 30 }) }),
    );
    const updates = new UpdateState(search);

    await updates.searchFor(OVERVIEW);
    updates.locked = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(search).toHaveBeenCalledTimes(1);

    updates.locked = false;
    await updates.searchFor(OVERVIEW);
    // A refresh before the time is up waits again from then, once.
    await vi.advanceTimersByTimeAsync(15_000);
    await updates.searchFor(OVERVIEW);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(search).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledTimes(4);
  });

  test('checks live: has the catalogue check again, then searches again', async () => {
    const catalogue = said();
    let answer = () => {};
    vi.mocked(catalogue.recheck).mockImplementation(
      () =>
        new Promise(resolve => {
          answer = () => {
            resolve(true);
          };
        }),
    );
    const search = vi.fn(() => Promise.resolve({ ...finding(APP), catalogue }));
    const updates = new UpdateState(search);
    await updates.searchFor(OVERVIEW);

    const checked = updates.checkLive();
    expect(updates.checking).toBe(true);
    // A second check while one is under way does nothing.
    await updates.checkLive();
    answer();
    await checked;

    expect(catalogue.recheck).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledTimes(2);
    expect(updates.checking).toBe(false);
  });

  test('checks nothing before a search, without the catalogue, or while a plan runs', async () => {
    const catalogue = said();
    await new UpdateState(() => Promise.resolve({ ...finding(APP), catalogue })).checkLive();
    const without = new UpdateState(() => Promise.resolve(finding(APP)));
    await without.searchFor(OVERVIEW);
    await without.checkLive();
    const running = new UpdateState(() => Promise.resolve({ ...finding(APP), catalogue }));
    await running.searchFor(OVERVIEW);
    running.locked = true;
    await running.checkLive();

    expect(catalogue.recheck).not.toHaveBeenCalled();
  });
});

describe('why the plan takes the version it does', () => {
  /**
   * A planner that knows newer versions of the app than those it offers, each refused for a reason.
   * @returns The planner
   */
  const planner = (): Planner => ({
    ...alone(APP),
    newerThan: (_key, version) => ['5.0.0', '4.0.0', '3.0.0', '2.5.0', '2.0.0'].filter(newer => newer > version),
    whyNotTaken: (_key, version) => {
      switch (version) {
        case '5.0.0':
        case '4.0.0':
          return Promise.resolve({ reason: 'no-manifest' as const });
        case '3.0.0':
          return Promise.resolve({ reason: 'conflict' as const, explanation: ['Lib is too old'] });
        case '2.5.0':
          return Promise.resolve({ reason: 'no-build' as const, minimum: '15' });
        default:
          return Promise.resolve(undefined);
      }
    },
  });

  test('gives each newer version and why, folding those one after another for one reason', async () => {
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP), planner: planner() }));
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '1.5.0');

    await expect(updates.notTakenOf('module:app')).resolves.toEqual([
      { newest: '5.0.0', oldest: '4.0.0', why: { reason: 'no-manifest' } },
      { newest: '3.0.0', oldest: '3.0.0', why: { reason: 'conflict', explanation: ['Lib is too old'] } },
      { newest: '2.5.0', oldest: '2.5.0', why: { reason: 'no-build', minimum: '15' } },
      // The plan could take it now, as the choices have changed since.
      { newest: '2.0.0', oldest: '2.0.0', why: { reason: 'possible' } },
    ]);
  });

  test('says nothing of a package the plan does not change, uninstalls, nor of Foundry VTT', async () => {
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP), planner: planner() }));
    await expect(updates.notTakenOf('module:app')).resolves.toEqual([]);
    await updates.searchFor(OVERVIEW);
    await expect(updates.notTakenOf('module:app')).resolves.toEqual([]);
    await expect(updates.notTakenOf('core')).resolves.toEqual([]);
  });
});

describe('versions refused alike, each naming itself', () => {
  // Regression: Monster Blocks' newer versions were each listed, as the resolver's explanation names the version it is
  // of, so no two explanations were the same.
  test('share a line, however their explanations name them', async () => {
    const explanation = (version: string) => [
      `Because monsterblock ${version} depends on _mathjs and no version of _mathjs is available, monsterblock ${version} cannot be used.`,
      `So, because the plan has monsterblock ${version}, the plan cannot keep working. (1)`,
    ];
    const updates = new UpdateState(() =>
      Promise.resolve({
        ...finding(APP),
        planner: {
          ...alone(APP),
          newerThan: () => ['3.5.1', '3.5.0', '3.0.0', '2.5.0'],
          whyNotTaken: (_key: string, version: string) =>
            Promise.resolve(
              version === '2.5.0'
                ? { reason: 'no-manifest' as const }
                : { reason: 'conflict' as const, explanation: explanation(version) },
            ),
        },
      }),
    );
    await updates.searchFor(OVERVIEW);
    await updates.choose('module:app', '1.5.0');

    await expect(updates.notTakenOf('module:app')).resolves.toEqual([
      { newest: '3.5.1', oldest: '3.0.0', why: { reason: 'conflict', explanation: explanation('3.5.1') } },
      { newest: '2.5.0', oldest: '2.5.0', why: { reason: 'no-manifest' } },
    ]);
  });

  test.each([
    ['monsterblock 2.1.0 cannot be used.', true],
    ['the plan has monsterblock 2.1.0, the plan', true],
    ['ends with 2.1.0.', true],
    ['not 12.1.0 nor 2.1.0-beta nor 2.1.0.1 nor v2.1.0x', false],
  ])('finds a version standing alone in %s', (line, found) => {
    expect(versionIn('2.1.0').test(line)).toBe(found);
  });
});

describe('planning the best versions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Regression: the busy mark on Plan the best versions never showed, as the planner's answers, settling at once, kept
  // the browser from drawing until every package was planned.
  test('lets the browser draw before it plans, so that what shows it busy is drawn', async () => {
    const planner = alone(APP);
    const complete = vi.fn(planner.complete);
    const updates = new UpdateState(() => Promise.resolve({ ...finding(APP), planner: { ...planner, complete } }));
    await updates.searchFor(
      buildOverview(installation({ modules: [installedModule('app', 'App', '1.0.0')] }), new Map()),
    );
    vi.useFakeTimers();

    const planning = updates.planBest();
    await vi.advanceTimersByTimeAsync(0);
    expect(complete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await expect(planning).resolves.toBe(true);
    expect(complete).toHaveBeenCalled();
  });
});

describe('updates the plan holds back', () => {
  const LIBRARY: PackageUpdate = {
    key: 'module:lib',
    installed: '1.0.0',
    newest: '2.0.0',
    versions: ['2.0.0', '1.0.0'],
  };
  const INSTALLED = buildOverview(
    installation({ modules: [installedModule('app', 'App', '1.0.0'), installedModule('lib', 'Library', '1.0.0')] }),
    new Map(),
  );

  /**
   * A search whose planner cannot take the app's newer versions unless the library is at 2.0.0.
   * @returns The state, searched, and the planner's completion, to count its calls
   */
  async function searched() {
    const planner = alone(APP, LIBRARY);
    const complete = vi.fn((picks: ReadonlyMap<string, string>) =>
      (picks.get('module:app') ?? '1.0.0') !== '1.0.0' && picks.get('module:lib') !== '2.0.0'
        ? Promise.resolve({ ok: false as const })
        : planner.complete(picks),
    );
    const updates = new UpdateState(() =>
      Promise.resolve({ ...finding(APP, LIBRARY), planner: { ...planner, complete } }),
    );
    await updates.searchFor(INSTALLED);
    return { updates, complete };
  }

  test('are those with an update none of whose newer versions the plan can take, not one it changes already', async () => {
    const { updates } = await searched();
    await updates.checkHeldBack();
    expect(updates.heldBack('module:app')).toBe(true);
    expect(updates.heldBack('module:lib')).toBe(false);

    // Its panel explains it at the version installed, what holds back each newer one.
    expect(updates.explainedAt('module:app')).toBe('1.0.0');
    expect(updates.explainedAt('module:lib')).toBeUndefined();

    await updates.choose('module:lib', '2.0.0');
    await updates.checkHeldBack();
    expect(updates.heldBack('module:app')).toBe(false);
    expect(updates.heldBack('module:lib')).toBe(false);
    expect(updates.explainedAt('module:app')).toBeUndefined();
    expect(updates.explainedAt('module:lib')).toBe('2.0.0');
  });

  test('are not checked again for the same plan, and a check begun is given up once another is', async () => {
    const { updates, complete } = await searched();
    await updates.checkHeldBack();
    const calls = complete.mock.calls.length;
    await updates.checkHeldBack();
    expect(complete.mock.calls.length).toBe(calls);

    await updates.choose('module:lib', '2.0.0');
    const first = updates.checkHeldBack();
    updates.clear();
    await Promise.all([first, updates.checkHeldBack()]);
    // As the last check found, with nothing chosen.
    expect(updates.heldBack('module:app')).toBe(true);
  });

  test('are none before the search has found anything, and checked once it has', async () => {
    const planner = alone(APP);
    const updates = new UpdateState(() =>
      Promise.resolve({
        ...finding(APP),
        planner: { ...planner, complete: () => Promise.resolve({ ok: false as const }) },
      }),
    );
    await updates.checkHeldBack();
    expect(updates.heldBack('module:app')).toBe(false);

    await updates.searchFor(
      buildOverview(installation({ modules: [installedModule('app', 'App', '1.0.0')] }), new Map()),
    );
    await updates.checkHeldBack();
    expect(updates.heldBack('module:app')).toBe(true);
  });
});

describe("a package's latest version known", () => {
  test('is the newest the search found, or the installed one where none is newer, and none before the search', async () => {
    const planner = alone(APP);
    const updates = new UpdateState(() =>
      Promise.resolve({
        ...finding(APP),
        planner: { ...planner, newerThan: (key: string) => (key === 'module:app' ? ['3.0.0', '2.0.0'] : []) },
      }),
    );
    expect(updates.latestKnown('module:app', '1.0.0')).toBeUndefined();
    await updates.searchFor(OVERVIEW);
    expect(updates.latestKnown('module:app', '1.0.0')).toBe('3.0.0');
    expect(updates.latestKnown('module:other', '1.0.0')).toBe('1.0.0');
  });
});

describe("a package's title in the window", () => {
  test("is the catalogue's for a package not installed that the planner knows, before its key", async () => {
    const planner = alone(APP);
    const updates = new UpdateState(() =>
      Promise.resolve({
        ...finding(APP),
        planner: { ...planner, titleOf: (key: string) => (key === 'module:_mathjs' ? 'Math.js' : key) },
      }),
    );
    await updates.searchFor(OVERVIEW);
    expect(updates.titleOf('module:_mathjs')).toBe('Math.js');
    expect(updates.titleOf('module:unknown')).toBe('module:unknown');
  });
});
