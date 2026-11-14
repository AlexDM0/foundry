/**
 * The fixed intent list against what Flint can do: every intent means a behaviour, a gesture in one of its moods, or an emote, and every
 * gesture, mood and emote is reachable through some intent, so a director can ask for anything Flint knows and nothing else.
 */
import { expect, test } from 'bun:test';

import { intentMeaningOf }                from './IntentMeaning.ts';
import { isSpriteIntent, SPRITE_INTENTS } from './SpriteHabitat.ts';
import { EMOTE_NAMES }                    from './emotes/EmoteDefinition.ts';
import { GESTURE_CATALOG }                from './gestures/GestureCatalog.ts';
import { GESTURE_NAMES }                  from './gestures/GestureDefinition.ts';

const MEANINGS = SPRITE_INTENTS.map(intentMeaningOf);

test('every gesture and every emote is reachable through an intent', () => {
  expect([...new Set(MEANINGS.flatMap((meaning) => (meaning.kind === 'gesture' ? [meaning.gesture] : [])))].sort()).toEqual([...GESTURE_NAMES].sort());
  expect(MEANINGS.flatMap((meaning) => (meaning.kind === 'emote' ? [meaning.emote] : [])).sort()).toEqual([...EMOTE_NAMES].sort());
});

test('the behaviours are wander, visit, copy and sleep', () => {
  expect(MEANINGS.flatMap((meaning) => (meaning.kind === 'behaviour' ? [meaning.behaviour] : []))).toEqual(['wander', 'visit', 'copy', 'sleep']);
});

test('each mood of each gesture has its intent, and no intent asks a gesture for a mood it lacks', () => {
  const gestureMoods = MEANINGS.flatMap((meaning) => (meaning.kind === 'gesture' ? [`${meaning.gesture} ${meaning.mood}`] : [])).sort();
  const definedMoods = GESTURE_NAMES.flatMap((name) => GESTURE_CATALOG[name].moods.map((mood) => `${name} ${mood}`)).sort();
  expect(gestureMoods).toEqual(definedMoods);
});

test('a value off the list is not an intent', () => {
  expect(isSpriteIntent('type-busy')).toBe(true);
  expect(isSpriteIntent('dance')).toBe(false);
  expect(isSpriteIntent('merge-angry')).toBe(false);
});
