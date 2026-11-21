/**
 * The fixed intent list against what Flint can do: every intent means a behaviour, a gesture in one of its forms, or an emote, and every
 * gesture form and emote of the catalogs is reachable through its intent, so a director can ask for anything Flint knows and nothing
 * else. The intents of the first build keep their names and their order.
 */
import { expect, test } from 'bun:test';

import { intendedGestureOf, intentAimsAtElement, intentMeaningOf } from './IntentMeaning.ts';
import { FLINT_CONTRACT_VERSIONS, isSpriteIntent, SPRITE_INTENTS } from './SpriteHabitat.ts';
import { BEHAVIOUR_INTENTS }                                       from './behaviours/BehaviourCatalog.ts';
import { EMOTE_NAMES }                                             from './emotes/EmoteCatalog.ts';
import { GESTURE_INTENTS }                                         from './gestures/GestureCatalog.ts';

const MEANINGS = SPRITE_INTENTS.map(intentMeaningOf);

const FIRST_BUILD_INTENTS: readonly string[] = [
  'wander',
  'visit',
  'copy',
  'sleep',
  'wave',
  'point',
  'type',
  'type-busy',
  'type-angry',
  'review',
  'review-busy',
  'review-angry',
  'research',
  'make-ticket',
  'merge',
  'fasten',
  'grab',
  'annoyed',
  'sweatdrop',
  'surprised',
  'doubt',
  'thinking',
  'idea',
  'happy',
  'nervous',
];

test('the intents of the first build keep their names and order, and the list carries its raised version', () => {
  const listed: readonly string[] = SPRITE_INTENTS;
  expect(listed.filter((intent) => FIRST_BUILD_INTENTS.includes(intent))).toEqual([...FIRST_BUILD_INTENTS]);
  expect(FLINT_CONTRACT_VERSIONS.spriteIntents).toBe(3);
});

test('every gesture form and every emote is reachable through its intent, and no intent is listed twice', () => {
  const gestureIntents = MEANINGS.flatMap((meaning) => (meaning.kind === 'gesture' ? [meaning.intent] : []));
  expect(gestureIntents).toEqual([...GESTURE_INTENTS]);
  expect(MEANINGS.flatMap((meaning) => (meaning.kind === 'emote' ? [meaning.emote] : []))).toEqual([...EMOTE_NAMES]);
  expect(new Set(SPRITE_INTENTS).size).toBe(SPRITE_INTENTS.length);
});

test('the behaviours are wander, visit, copy and sleep, then the chase of the bug and the lay of a bar', () => {
  expect(MEANINGS.flatMap((meaning) => (meaning.kind === 'behaviour' ? [meaning.behaviour] : []))).toEqual(['wander', 'visit', 'copy', 'sleep', 'chase-bug', 'lay-bar-along']);
  expect([...BEHAVIOUR_INTENTS]).toEqual(['wander', 'visit', 'copy', 'sleep', 'chase-bug', 'lay-bar-along']);
});

test('a gesture intent names its gesture and the form it runs', () => {
  expect([intendedGestureOf('type-busy').definition.name, intendedGestureOf('type-busy').form.variant]).toEqual(['type', 'busy']);
  expect([intendedGestureOf('merge').definition.name, intendedGestureOf('merge').form.variant]).toEqual(['merge', 'normal']);
});

test('only an intent of a gesture that aims takes an element', () => {
  expect(SPRITE_INTENTS.filter(intentAimsAtElement)).toEqual(['grab']);
});

test('a value off the list is not an intent', () => {
  expect(isSpriteIntent('type-busy')).toBe(true);
  expect(isSpriteIntent('dance')).toBe(false);
  expect(isSpriteIntent('merge-angry')).toBe(false);
});
