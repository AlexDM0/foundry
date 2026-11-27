/**
 * Played through the mind, the pose and the easing as `createFlint` plays them, every gesture and emote whose declared extent fits a small
 * box that keeps Flint inside draws nothing outside it, in either facing, with or without attendants. The box is the smallest a host keeps
 * for Flint.
 */
import { expect, test } from 'bun:test';

import { easedPoseOf }                                             from '../../PoseEasing.ts';
import type { DrawnExtent }                                        from '../../SpriteGeometry.ts';
import { INITIAL_MIND_STATE, mindStateAttended, targetPoseOfMind } from '../../SpriteMind.ts';
import type { Pose }                                               from '../../SpritePose.ts';
import { ATTENDANT_CATALOG }                                       from '../../attendants/AttendantCatalog.ts';
import { EMOTE_CATALOG }                                           from '../../emotes/EmoteCatalog.ts';
import { GESTURE_CATALOG }                                         from '../../gestures/GestureCatalog.ts';
import { DrawnExtentMeasure }                                      from '../../testing/DrawnExtentMeasure.ts';
import {
  CHAT,
  createMindRun,
  FRAME_MILLISECONDS,
  habitatOf,
  perceptionOf
} from '../../testing/MindRun.ts';
import { StanceUtil } from './StanceUtil.ts';

const SMALL_BOX_PIXELS_FOR_ONE_UNIT = 0.75;

const SMALL_BOX = Object.freeze({
  leftX: 700, rightX: 700 + (60 / SMALL_BOX_PIXELS_FOR_ONE_UNIT), topY: 500 - (50 / SMALL_BOX_PIXELS_FOR_ONE_UNIT), floorY: 500,
});

/** As long as the catalogs' extent specs play a loop, so a loop that alternates its cycles shows each. */
const PLAY_MILLISECONDS = 16000;
/** The first frames ease in from the neutral pose the run starts with, before Flint stood anywhere. */
const EASING_IN_FRAME_COUNT = 5;
/** Under a twentieth of a pixel here, which no browser shows: a fading prop meets the hover's swing at another phase than in its catalog spec. */
const OUTSIDE_TOLERANCE_UNITS = 0.05;

const ATTENDED_STATE = ATTENDANT_CATALOG.reduce(
  (state, definition) => mindStateAttended(state, definition.name, definition.maximumCount, 0),
  INITIAL_MIND_STATE,
);
const ATTENDED_RESTING_RANGE = StanceUtil.restingRangeOf(SMALL_BOX, ATTENDED_STATE);

function fitsTheBox(extent: DrawnExtent): boolean {
  const attendantBackUnits = Math.max(...ATTENDANT_CATALOG.map((definition) => definition.extent.backUnits));
  const attendantTopUnits = Math.max(...ATTENDANT_CATALOG.map((definition) => definition.extent.aboveFloorUnits));
  const widthUnits = Math.max(extent.backUnits, attendantBackUnits) + extent.frontUnits;
  const heightUnits = Math.max(extent.aboveFloorUnits, attendantTopUnits);
  return widthUnits <= SMALL_BOX.rightX - SMALL_BOX.leftX && heightUnits <= SMALL_BOX.floorY - SMALL_BOX.topY && extent.belowFloorUnits <= 0;
}

const FITTING_INTENTS = [
  ...GESTURE_CATALOG.flatMap((definition) => Object.entries(definition.intents).map(([intent, form]) => ({ intent, extent: form.extent }))),
  ...EMOTE_CATALOG.map((definition) => ({ intent: definition.name, extent: definition.extent })),
].filter(({ extent }) => fitsTheBox(extent)).map(({ intent }) => intent);

/** How far the pose draws outside the box on its worst side, in units; 0 inside. */
function outsideUnitsOf(pose: Pose): number {
  const extent = DrawnExtentMeasure.drawnExtentOf(pose);
  const { positionX, facing, floorY } = pose.body;
  const leftX = positionX - (facing === 1 ? extent.backUnits : extent.frontUnits);
  const rightX = positionX + (facing === 1 ? extent.frontUnits : extent.backUnits);
  return Math.max(0, SMALL_BOX.leftX - leftX, rightX - SMALL_BOX.rightX, SMALL_BOX.topY - (floorY - extent.aboveFloorUnits), extent.belowFloorUnits);
}

function worstOutsideUnitsOf(intent: string, startX: number, facing: 1 | -1, attended: boolean, reducedMotion: boolean): number {
  const slot = habitatOf('slot', SMALL_BOX, { keepsFlintInside: true });
  const run = createMindRun(undefined, perceptionOf({ habitats: [CHAT, slot], reducedMotion }));
  run.frame({ storedHabitatId: 'slot' });
  run.runUntil((state) => state.livesIn === 'slot' && state.behaviour.name === 'wander');
  if (attended) {
    for (const definition of ATTENDANT_CATALOG) run.change((state) => mindStateAttended(state, definition.name, definition.maximumCount, run.elapsedMilliseconds()));
  }
  run.runFor(1000);
  run.change((state) => ({ ...state, motion: { ...state.motion, positionX: startX, facing } }));
  run.give(intent as never);
  let drawn: Pose | null = null;
  let worstUnits = 0;
  for (let i = 0; i * FRAME_MILLISECONDS < PLAY_MILLISECONDS; i++) {
    const state = run.frame();
    const target = targetPoseOfMind(state, run.elapsedMilliseconds(), reducedMotion);
    drawn = drawn === null ? target : easedPoseOf(drawn, target, FRAME_MILLISECONDS);
    if (i >= EASING_IN_FRAME_COUNT) worstUnits = Math.max(worstUnits, outsideUnitsOf(drawn));
  }
  return worstUnits;
}

test('some gestures and emotes fit the small box, and some do not', () => {
  expect(FITTING_INTENTS.length).toBeGreaterThan(10);
  expect(FITTING_INTENTS.length).toBeLessThan(GESTURE_CATALOG.length + EMOTE_CATALOG.length);
});

test.each(FITTING_INTENTS)('%s draws only inside the box, from either end at rest, facing either way', (intent) => {
  const worstUnits = [false, true].flatMap((attended) => [false, true].flatMap((reducedMotion) => [ATTENDED_RESTING_RANGE.lowestX, ATTENDED_RESTING_RANGE.highestX]
    .flatMap((startX) => ([1, -1] as const).map((facing) => worstOutsideUnitsOf(intent, startX, facing, attended, reducedMotion)))));
  expect(Math.max(...worstUnits)).toBeLessThanOrEqual(OUTSIDE_TOLERANCE_UNITS);
});
