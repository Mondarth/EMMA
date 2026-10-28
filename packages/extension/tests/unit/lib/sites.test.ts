import { describe, expect, test } from 'vitest';

import {
  autoPatterns,
  isSetupPage,
  opensOn,
  originOf,
  parseSites,
  patternFor,
  patternInUse,
  withoutSite,
  withSite,
} from '../../../src/lib/sites';

const LOCAL = 'http://localhost:30000';
const OTHER_PORT = 'http://localhost:30001';
const REMOTE = 'https://vtt.example.com';

describe('originOf', () => {
  test.each([
    ['http://localhost:30000/setup', LOCAL],
    ['https://vtt.example.com/foundry/setup?x=1', REMOTE],
    ['chrome://extensions', undefined],
    ['about:blank', undefined],
    ['not a URL', undefined],
    [undefined, undefined],
  ])('%s is %s', (url, origin) => {
    expect(originOf(url)).toBe(origin);
  });
});

describe('isSetupPage', () => {
  test.each([
    ['http://localhost:30000/setup', true],
    ['http://localhost:30000/setup/', true],
    ['https://vtt.example.com/foundry/setup', true],
    ['http://localhost:30000/game', false],
    ['http://localhost:30000/setups', false],
    ['file:///setup', false],
    [undefined, false],
  ])('%s: %s', (url, expected) => {
    expect(isSetupPage(url)).toBe(expected);
  });
});

describe('patternFor', () => {
  test('names the port on Chromium, and every port of the host on Firefox, which cannot name one', () => {
    expect(patternFor(LOCAL, 'chromium')).toBe('http://localhost:30000/*');
    expect(patternFor(LOCAL, 'firefox')).toBe('http://localhost/*');
    expect(patternFor(REMOTE, 'firefox')).toBe('https://vtt.example.com/*');
  });
});

describe('the servers remembered', () => {
  test('are added, changed and forgotten, sorted by origin', () => {
    const sites = withSite(withSite([], REMOTE, true), LOCAL, true);
    expect(sites).toEqual([
      { origin: LOCAL, auto: true },
      { origin: REMOTE, auto: true },
    ]);

    expect(withSite(sites, LOCAL, false)).toEqual([
      { origin: LOCAL, auto: false },
      { origin: REMOTE, auto: true },
    ]);
    expect(withoutSite(sites, LOCAL)).toEqual([{ origin: REMOTE, auto: true }]);
  });

  test("give the loader's patterns: those EMMA opens on by itself, each once", () => {
    const sites = [
      { origin: LOCAL, auto: true },
      { origin: OTHER_PORT, auto: true },
      { origin: REMOTE, auto: false },
    ];

    expect(autoPatterns(sites, 'chromium')).toEqual(['http://localhost:30000/*', 'http://localhost:30001/*']);
    expect(autoPatterns(sites, 'firefox')).toEqual(['http://localhost/*']);
  });

  test('keep a pattern another server shares', () => {
    const sites = [{ origin: OTHER_PORT, auto: false }];

    expect(patternInUse(sites, 'http://localhost/*', 'firefox')).toBe(true);
    expect(patternInUse(sites, 'http://localhost:30000/*', 'chromium')).toBe(false);
  });

  test('open EMMA by itself only on the setup screen of a server it opens on by itself', () => {
    const sites = [
      { origin: LOCAL, auto: true },
      { origin: REMOTE, auto: false },
    ];

    expect(opensOn(sites, 'http://localhost:30000/setup')).toBe(true);
    expect(opensOn(sites, 'http://localhost:30000/game')).toBe(false);
    expect(opensOn(sites, 'http://localhost:30001/setup')).toBe(false);
    expect(opensOn(sites, 'https://vtt.example.com/setup')).toBe(false);
  });

  test('are read from storage, leaving out anything else', () => {
    expect(
      parseSites([
        { origin: LOCAL, auto: true },
        { origin: 'http://localhost:30000/setup', auto: true },
        { origin: 'chrome://extensions', auto: true },
        { origin: REMOTE, auto: 'yes' },
        null,
        'text',
      ]),
    ).toEqual([{ origin: LOCAL, auto: true }]);
    expect(parseSites(undefined)).toEqual([]);
  });
});
