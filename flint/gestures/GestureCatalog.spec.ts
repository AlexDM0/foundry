/**
 * The gesture catalog against the rules of `02-animations.md` that the mind reads from it: every gesture is listed under its own name;
 * only type and review have the busy and angry moods; point and grab go on while Flint walks; only point goes on while it jumps.
 */
import { expect, test } from 'bun:test';

import { GESTURE_CATALOG } from './GestureCatalog.ts';
import { GESTURE_NAMES }   from './GestureDefinition.ts';

test('every gesture is listed under its own name', () => {
  expect(Object.keys(GESTURE_CATALOG).sort()).toEqual([...GESTURE_NAMES].sort());
  for (const name of GESTURE_NAMES) expect(GESTURE_CATALOG[name].name).toBe(name);
});

test('only type and review have the busy and angry moods; every gesture has the normal mood', () => {
  expect(GESTURE_NAMES.filter((name) => GESTURE_CATALOG[name].moods.length > 1).sort()).toEqual(['review', 'type']);
  expect(GESTURE_NAMES.every((name) => GESTURE_CATALOG[name].moods.includes('normal'))).toBe(true);
});

test('point and grab go on while Flint walks, and only point while it jumps', () => {
  expect(GESTURE_NAMES.filter((name) => GESTURE_CATALOG[name].continuesWhileWalking).sort()).toEqual(['grab', 'point']);
  expect(GESTURE_NAMES.filter((name) => GESTURE_CATALOG[name].continuesWhileJumping)).toEqual(['point']);
});
