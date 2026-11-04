/**
 * The resolver's explanations in EMMA's words. The resolver words its explanations through an `ExplanationMessages`
 * object, each phrase a function of the phrases inside it, so word order can follow the language; this one takes every
 * phrase from EMMA's localization file rather than the resolver's English.
 */
import type { ExplanationMessages, PackageKey } from '@mondarth/fvtt-resolver';
import { CORE, REQUIREMENTS, WORLD_SYSTEM } from '@mondarth/fvtt-resolver';

import { format, formatList, localize } from '@module/lib/i18n';

const KEY = 'MONDARTH-EMMA.Report.Explain';

/**
 * A phrase from the localization file.
 * @param name - The phrase's key under `Report.Explain`
 * @param data - The values of its placeholders
 * @returns The phrase
 */
function say(name: string, data: Record<string, string> = {}): string {
  return format(`${KEY}.${name}`, data);
}

/**
 * The resolver's explanation messages, in the user's language.
 * @param titleOf - The title of a package, by its key (`module:dice`, `system:dnd5e`), or `undefined` for one not known
 * @returns The messages
 */
export function explanationMessages(titleOf: (key: PackageKey) => string | undefined): ExplanationMessages {
  return {
    name(key) {
      if (key === CORE) return localize('MONDARTH-EMMA.Versions.Core');
      if (key === REQUIREMENTS) return localize(`${KEY}.Requirements`);
      if (key === WORLD_SYSTEM) return localize(`${KEY}.WorldSystem`);
      return titleOf(key) ?? key.slice(key.indexOf(':') + 1);
    },
    term: (name, versions) => (versions === undefined ? name : say('Term', { name, versions })),
    world: systems => (systems === undefined ? localize(`${KEY}.AnySystemWorld`) : say('World', { systems })),
    system: (id, versions) => (versions === undefined ? id : say('System', { id, versions })),
    exactly: version => version,
    from: (version, inclusive) => say(inclusive ? 'FromInclusive' : 'FromExclusive', { version }),
    to: (version, inclusive) => say(inclusive ? 'ToInclusive' : 'ToExclusive', { version }),
    between: (lower, lowerInclusive, upper, upperInclusive) =>
      say(`Between${lowerInclusive ? 'Inclusive' : 'Exclusive'}${upperInclusive ? 'Inclusive' : 'Exclusive'}`, {
        lower,
        upper,
      }),
    otherThan: versions => say('OtherThan', { versions }),
    otherSystems: systems => say('OtherSystems', { systems }),
    none: localize(`${KEY}.None`),
    or: parts => formatList(parts, 'disjunction'),
    dependsOn: (release, on) => say('DependsOn', { release, on }),
    conflictsWith: (release, on) => say('ConflictsWith', { release, on }),
    runsIn: (release, systems) => say('RunsIn', { release, systems }),
    unusable: release => say('Unusable', { release }),
    missingManifest: release => say('MissingManifest', { release }),
    excluded: (release, reason) => say('Excluded', { release, reason }),
    excludedWith: (release, on, reason) => say('ExcludedWith', { release, on, reason }),
    overridden: (text, reason) => say('Overridden', { text, reason }),
    coreLimit: (core, reason) => say('CoreLimit', { core, reason }),
    requirement: on => say('Requirement', { on }),
    pin: on => say('Pin', { on }),
    setupNeeds: what => say('SetupNeeds', { what }),
    worldSystem: system => say('IsWorldSystem', { system }),
    noVersions: term => say('NoVersions', { term }),
    noSystem: systems => (systems === undefined ? localize(`${KEY}.NoSystem`) : say('NoSystemIn', { systems })),
    failed: localize(`${KEY}.Failed`),
    wanted: localize(`${KEY}.Wanted`),
    forbidden: term => say('Forbidden', { term }),
    needed: term => say('Needed', { term }),
    needs: (term, needed) => say('Needs', { term, needed }),
    requirementsNeed: needed => say('RequirementsNeed', { needed }),
    incompatible: (a, b) => say('Incompatible', { a, b }),
    either: terms => say('Either', { terms: formatList(terms, 'disjunction') }),
    ifThen: (given, then) => say('IfThen', { given: formatList(given), then: formatList(then, 'disjunction') }),
    because: (a, b, conclusion) => say('Because', { a, b, conclusion }),
    andBecause: (a, conclusion, so) => say(so ? 'SoBecause' : 'AndBecause', { a, conclusion }),
    andBecauseBoth: (a, b, conclusion, so) => say(so ? 'SoBecauseBoth' : 'AndBecauseBoth', { a, b, conclusion }),
    thus: conclusion => say('Thus', { conclusion }),
    sentence: text => say('Sentence', { text: `${text.charAt(0).toLocaleUpperCase(game.i18n.lang)}${text.slice(1)}` }),
    see: (phrase, number) => say('See', { phrase, number: String(number) }),
  };
}
