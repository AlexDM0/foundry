/**
 * The gesture catalog against the rules that the mind reads from it. No two gestures share a name or an intent.
 * Among the gestures of the first build: only type and review have the busy and angry variants; point and grab go on while Flint walks;
 * only point goes on while it jumps; only grab aims at an element; grab and wave are one action, every other runs until something stops
 * it. A gesture added later keeps these lists as they are.
 */
import { expect, test } from 'bun:test';

import { GESTURE_CATALOG, GESTURE_INTENTS } from './GestureCatalog.ts';

const FIRST_BUILD_GESTURES: readonly string[] = ['wave', 'point', 'type', 'review', 'research', 'make-ticket', 'merge', 'fasten', 'grab'];

const FIRST_BUILD_CATALOG = GESTURE_CATALOG.filter((definition) => FIRST_BUILD_GESTURES.includes(definition.name));

const namesWhere = (predicate: (definition: typeof GESTURE_CATALOG[number]) => boolean): readonly string[] => FIRST_BUILD_CATALOG
  .filter(predicate)
  .map((definition) => definition.name)
  .sort();

test('no two gestures share a name or an intent', () => {
  expect(new Set(GESTURE_CATALOG.map((definition) => definition.name)).size).toBe(GESTURE_CATALOG.length);
  expect(new Set(GESTURE_INTENTS).size).toBe(GESTURE_INTENTS.length);
});

test('only type and review have the busy and angry variants; every gesture has a normal variant', () => {
  expect(namesWhere((definition) => Object.keys(definition.intents).length > 1)).toEqual(['review', 'type']);
  expect(Object.values(GESTURE_CATALOG.find((definition) => definition.name === 'type')?.intents ?? {}).map((form) => form.variant)).toEqual(['normal', 'busy', 'angry']);
  const firstBuildNames: readonly string[] = FIRST_BUILD_CATALOG.map((definition) => definition.name);
  expect(firstBuildNames).toEqual(FIRST_BUILD_GESTURES);
  expect(FIRST_BUILD_CATALOG.every((definition) => Object.values(definition.intents).some((form) => form.variant === 'normal'))).toBe(true);
});

test('point and grab go on while Flint walks, and only point while it jumps; only grab aims at an element', () => {
  expect(namesWhere((definition) => definition.continuesWhileWalking)).toEqual(['grab', 'point']);
  expect(namesWhere((definition) => definition.continuesWhileJumping)).toEqual(['point']);
  expect(namesWhere((definition) => definition.aimsAtElement)).toEqual(['grab']);
});

test('grab and wave are one action; the other gestures of the first build run until something stops them', () => {
  const oneAction = FIRST_BUILD_CATALOG.flatMap((definition) => Object.entries(definition.intents)
    .flatMap(([intent, form]) => (form.durationMilliseconds === null ? [] : [intent])));
  expect(oneAction.sort()).toEqual(['grab', 'wave']);
});
