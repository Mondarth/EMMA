/**
 * What EMMA's package catalogue answers for the store's screenshots (see `screenshots.spec.ts`), as the real one would
 * for the made-up installation `scripts/e2e/install-packages.ts --store` sets up: newer versions of most of what is
 * installed, one of them for a newer Foundry VTT, which the plan cannot take, and Foundry's listing of modules to
 * install. Every package and author is made up.
 */
import moduleJSON from '../../../module.json' with { type: 'json' };

/** A release as the catalogue gives it, with the package it is of. */
interface StoreRelease {
  readonly version: string;
  readonly minimum?: string;
  readonly verified?: string;
  readonly requires?: readonly (readonly [id: string, minimum?: string])[];
  readonly systems?: readonly (readonly [id: string, minimum?: string])[];
}

const AS_OF = '2026-11-27T09:00:00.000Z';

/** Each package's releases, oldest first, by key: what is installed, and what is newer. */
const RELEASES: Readonly<Record<string, { readonly title: string; readonly releases: readonly StoreRelease[] }>> = {
  'system:dnd5e': {
    title: 'Dungeons & Dragons Fifth Edition',
    releases: [{ version: '5.3.3' }, { version: '5.4.0', verified: '14.368' }],
  },
  'module:lib-wrapper': { title: 'libWrapper', releases: [{ version: '1.13.5.1' }, { version: '1.13.6.0' }] },
  'module:mondarth-emma': { title: moduleJSON.title, releases: [{ version: moduleJSON.version }] },
  'module:ambient-weather': {
    title: 'Ambient Weather',
    // Its newest is for a Foundry VTT the plan does not have: EMMA explains why it takes 2.4.0.
    releases: [{ version: '2.3.0' }, { version: '2.4.0' }, { version: '2.5.0', minimum: '15', verified: '15' }],
  },
  'module:token-tracker': {
    title: 'Token Tracker',
    releases: [
      { version: '4.1.2', requires: [['lib-wrapper']] },
      { version: '4.2.0', requires: [['lib-wrapper', '1.13.6.0']] },
    ],
  },
  'module:dungeon-doors': { title: 'Dungeon Doors', releases: [{ version: '1.8.0' }] },
  'module:party-ledger': {
    title: 'Party Ledger',
    // Its update needs the newer game system, which comes into the plan with it.
    releases: [
      { version: '3.0.1', systems: [['dnd5e', '5.3.0']] },
      { version: '3.1.0', systems: [['dnd5e', '5.4.0']] },
    ],
  },
  'module:encounter-deck': {
    title: 'Encounter Deck',
    releases: [
      { version: '0.9.3', systems: [['dnd5e']] },
      { version: '0.9.4', systems: [['dnd5e']] },
      { version: '1.0.0', systems: [['dnd5e']] },
    ],
  },
  'module:quick-handouts': { title: 'Quick Handouts', releases: [{ version: '1.2.0' }, { version: '1.3.0' }] },
};

/**
 * A release, as `/api/v2/lookup` gives it.
 * @param key - Its package's key
 * @param release - What it is
 * @returns The release
 */
function releaseOf(key: string, release: StoreRelease) {
  const [type, id] = key.split(':') as ['module' | 'system', string];
  const manifest = `https://packages.example.org/${id}/${release.version}/${type}.json`;
  const related = (kind: 'module' | 'system', entries: StoreRelease['requires'] = []) =>
    entries.map(([other, minimum]) => ({
      package: { type: kind, id: other },
      compatibility: minimum === undefined ? {} : { minimum },
    }));
  return {
    version: release.version,
    compatibility: { minimum: release.minimum ?? '14', verified: release.verified ?? '14' },
    relationships: {
      requires: related('module', release.requires),
      systems: related('system', release.systems),
      conflicts: [],
      recommends: [],
    },
    manifest,
    versionManifest: manifest,
    download: manifest.replace(/[^/]+\.json$/, `${id}.zip`),
    protected: false,
    origin: 'catalogue',
    detail: 'loaded',
  };
}

/**
 * What `/api/v2/lookup` answers: every package of the installation, with its releases.
 * @returns The answer
 */
export function lookup() {
  return {
    core: [{ version: '14.368', generation: 14, channel: 'stable' }],
    packages: Object.entries(RELEASES).map(([key, { title, releases }]) => {
      const [type, id] = key.split(':') as ['module' | 'system', string];
      return {
        package: { type, id },
        title,
        latest: null,
        premium: false,
        syncedAt: AS_OF,
        own: { version: releases.at(-1)?.version ?? null, readAt: AS_OF, checkedAt: AS_OF },
        releases: releases.map(release => releaseOf(key, release)),
      };
    }),
    pending: [],
    unavailable: [],
    unreached: [],
    asOf: AS_OF,
  };
}

/** The modules Foundry's listing offers to install, made up. */
const LISTED: readonly (readonly [
  id: string,
  title: string,
  author: string,
  summary: string,
  tags: readonly string[],
  systems?: readonly string[],
])[] = [
  [
    'lantern-light',
    'Lantern Light',
    'Emberfall',
    'Flickering torches, lanterns and darkvision that feel right.',
    ['lighting', 'maps'],
  ],
  [
    'bestiary-builder',
    'Bestiary Builder',
    'Copperpot Guild',
    'Build, scale and share your own monsters.',
    ['content', 'utility'],
    ['dnd5e'],
  ],
  [
    'soundscape-mixer',
    'Soundscape Mixer',
    'Northwind Works',
    'Layer ambient sounds per scene, faded as players move.',
    ['audio-sound'],
  ],
  [
    'map-pins-plus',
    'Map Pins Plus',
    'Stonekeep Studio',
    'Richer map notes: icons, tooltips and player-visible pins.',
    ['maps', 'utility'],
  ],
  [
    'calendar-of-seasons',
    'Calendar of Seasons',
    'Hearthside Tools',
    'Track days, seasons, moons and festivals in your world.',
    ['utility'],
  ],
  [
    'initiative-plus',
    'Initiative Plus',
    'Emberfall',
    'A clearer combat tracker, with turn timers and delays.',
    ['combat'],
  ],
];

/**
 * What `/api/v2/listing` answers: the modules to install.
 * @returns The answer
 */
export function listing() {
  return {
    packages: LISTED.map(([id, title, author, summary, tags, systems = []]) => ({
      package: { type: 'module', id },
      title,
      summary,
      author,
      url: `https://packages.example.org/${id}/`,
      tags,
      systems,
      premium: false,
      exclusive: false,
      latest: '1.2.0',
      versions: [
        {
          version: '1.2.0',
          minimum: '14',
          maximum: null,
          verified: '14.368',
          manifest: `https://packages.example.org/${id}/module.json`,
          notes: null,
        },
      ],
    })),
    asOf: AS_OF,
  };
}
