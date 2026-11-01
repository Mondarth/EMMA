import { CORE, REQUIREMENTS, WORLD_SYSTEM } from '@mondarth/fvtt-resolver';
import { beforeEach, describe, expect, test } from 'vitest';

import { explanationMessages } from '@module/adapters/explanation';
import { installFoundryMocks } from '../../mocks/foundry';

const KEY = 'MONDARTH-EMMA.Report.Explain';

/**
 * What the mocked `format` gives for a phrase.
 * @param name - The phrase's key under `Report.Explain`
 * @param data - Its placeholders' values
 * @returns The phrase
 */
const said = (name: string, data: Record<string, string> = {}) => `${KEY}.${name} ${JSON.stringify(data)}`;

describe('explanationMessages', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  const messages = () => explanationMessages(key => (key === 'module:dice' ? 'Dice So Nice!' : undefined));

  test('names packages by their titles, and the resolver’s own by localized names', () => {
    const { name } = messages();

    expect([name(CORE), name(REQUIREMENTS), name(WORLD_SYSTEM), name('module:dice'), name('system:pf2e')]).toEqual([
      'MONDARTH-EMMA.Versions.Core',
      `${KEY}.Requirements`,
      `${KEY}.WorldSystem`,
      'Dice So Nice!',
      'pf2e',
    ]);
  });

  test('words every phrase from the localization file', () => {
    const m = messages();

    expect([
      m.term('dice'),
      m.term('dice', '1.0'),
      m.world(),
      m.world('dnd5e'),
      m.system('dnd5e'),
      m.system('dnd5e', '5.x'),
      m.exactly('1.0'),
      m.from('1.0', true),
      m.from('1.0', false),
      m.to('2.0', true),
      m.to('2.0', false),
      m.between('1.0', true, '2.0', true),
      m.between('1.0', true, '2.0', false),
      m.between('1.0', false, '2.0', true),
      m.between('1.0', false, '2.0', false),
      m.otherThan('1.0'),
      m.otherSystems('pf2e'),
      m.none,
      m.or(['a', 'b']),
      m.dependsOn('a', 'b'),
      m.conflictsWith('a', 'b'),
      m.runsIn('a', 'b'),
      m.unusable('a'),
      m.missingManifest('a'),
      m.excluded('a', 'r'),
      m.excludedWith('a', 'b', 'r'),
      m.overridden('t', 'r'),
      m.coreLimit('c', 'r'),
      m.requirement('a'),
      m.pin('a'),
      m.setupNeeds('a'),
      m.worldSystem('s'),
      m.noVersions('t'),
      m.noSystem(),
      m.noSystem('s'),
      m.failed,
      m.wanted,
      m.forbidden('t'),
      m.needed('t'),
      m.needs('t', 'n'),
      m.requirementsNeed('n'),
      m.incompatible('a', 'b'),
      m.either(['a', 'b']),
      m.ifThen(['a', 'b'], ['c', 'd']),
      m.because('a', 'b', 'c'),
      m.andBecause('a', 'c', false),
      m.andBecause('a', 'c', true),
      m.andBecauseBoth('a', 'b', 'c', false),
      m.andBecauseBoth('a', 'b', 'c', true),
      m.thus('c'),
      m.sentence('a thing'),
      m.see('p', 2),
    ]).toEqual([
      'dice',
      said('Term', { name: 'dice', versions: '1.0' }),
      `${KEY}.AnySystemWorld`,
      said('World', { systems: 'dnd5e' }),
      'dnd5e',
      said('System', { id: 'dnd5e', versions: '5.x' }),
      '1.0',
      said('FromInclusive', { version: '1.0' }),
      said('FromExclusive', { version: '1.0' }),
      said('ToInclusive', { version: '2.0' }),
      said('ToExclusive', { version: '2.0' }),
      said('BetweenInclusiveInclusive', { lower: '1.0', upper: '2.0' }),
      said('BetweenInclusiveExclusive', { lower: '1.0', upper: '2.0' }),
      said('BetweenExclusiveInclusive', { lower: '1.0', upper: '2.0' }),
      said('BetweenExclusiveExclusive', { lower: '1.0', upper: '2.0' }),
      said('OtherThan', { versions: '1.0' }),
      said('OtherSystems', { systems: 'pf2e' }),
      `${KEY}.None`,
      'a or b',
      said('DependsOn', { release: 'a', on: 'b' }),
      said('ConflictsWith', { release: 'a', on: 'b' }),
      said('RunsIn', { release: 'a', systems: 'b' }),
      said('Unusable', { release: 'a' }),
      said('MissingManifest', { release: 'a' }),
      said('Excluded', { release: 'a', reason: 'r' }),
      said('ExcludedWith', { release: 'a', on: 'b', reason: 'r' }),
      said('Overridden', { text: 't', reason: 'r' }),
      said('CoreLimit', { core: 'c', reason: 'r' }),
      said('Requirement', { on: 'a' }),
      said('Pin', { on: 'a' }),
      said('SetupNeeds', { what: 'a' }),
      said('IsWorldSystem', { system: 's' }),
      said('NoVersions', { term: 't' }),
      `${KEY}.NoSystem`,
      said('NoSystemIn', { systems: 's' }),
      `${KEY}.Failed`,
      `${KEY}.Wanted`,
      said('Forbidden', { term: 't' }),
      said('Needed', { term: 't' }),
      said('Needs', { term: 't', needed: 'n' }),
      said('RequirementsNeed', { needed: 'n' }),
      said('Incompatible', { a: 'a', b: 'b' }),
      said('Either', { terms: 'a or b' }),
      said('IfThen', { given: 'a and b', then: 'c or d' }),
      said('Because', { a: 'a', b: 'b', conclusion: 'c' }),
      said('AndBecause', { a: 'a', conclusion: 'c' }),
      said('SoBecause', { a: 'a', conclusion: 'c' }),
      said('AndBecauseBoth', { a: 'a', b: 'b', conclusion: 'c' }),
      said('SoBecauseBoth', { a: 'a', b: 'b', conclusion: 'c' }),
      said('Thus', { conclusion: 'c' }),
      said('Sentence', { text: 'A thing' }),
      said('See', { phrase: 'p', number: '2' }),
    ]);
  });
});
