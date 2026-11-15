/**
 * The rule director. What matters: the newest new cue with a suggestion wins, and a cue with none is passed over; with nothing new, a
 * sleeping Flint sleeps on, an awake one visits the visit target, copies what its habitat offers to copy, goes home to sleep after the
 * quiet time, and otherwise wanders.
 */
import { describe, expect, test } from 'bun:test';

import type { PerceptionDigest }               from '../SpriteHabitat.ts';
import { RULE_DIRECTOR, ruleDirectorIntentOf } from './RuleDirector.ts';

const CHAT_DIGEST: PerceptionDigest = {
  habitatKind: 'chat',
  description: 'The conversation with the agent.',
  suggestions: [
    { when: 'arrived', respond: 'wave' },
    { when: 'agent-is-writing', respond: 'type-busy' },
    { when: 'agent-is-done', respond: 'happy' },
  ],
  recentCues:        [],
  newCues:           [],
  content:           null,
  lastIntent:        null,
  isAsleep:          false,
  visitTargetKind:   null,
  copyIsOffered:     false,
  quietMilliseconds: 0,
};

describe('cues', () => {
  test('the newest new cue with a suggestion wins', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, newCues: ['agent-is-writing', 'agent-is-done'] })).toBe('happy');
  });

  test('a cue with no suggestion is passed over for an older one that has one', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, newCues: ['agent-is-writing', 'user-scrolls'] })).toBe('type-busy');
  });

  test('a cue answers even while Flint sleeps', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, isAsleep: true, newCues: ['arrived'] })).toBe('wave');
  });
});

describe('nothing new', () => {
  test('a sleeping Flint sleeps on, even with a visit target', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, isAsleep: true, visitTargetKind: 'agent-panel' })).toBe('sleep');
  });

  test('an awake Flint visits the visit target', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, visitTargetKind: 'agent-panel' })).toBe('visit');
  });

  test('an awake Flint copies what its habitat offers, also when no cue is new, but visits first', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, copyIsOffered: true, quietMilliseconds: 60000 })).toBe('copy');
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, copyIsOffered: true, visitTargetKind: 'chat' })).toBe('visit');
  });

  test('after a minute of quiet Flint goes home to sleep; before it, it wanders', () => {
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, quietMilliseconds: 59999 })).toBe('wander');
    expect(ruleDirectorIntentOf({ ...CHAT_DIGEST, quietMilliseconds: 60000 })).toBe('sleep');
  });
});

test('the rule director answers at once, as a director', () => {
  expect(RULE_DIRECTOR.nextIntent({ ...CHAT_DIGEST, newCues: ['arrived'] })).toBe('wave');
});
