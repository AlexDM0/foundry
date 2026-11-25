/**
 * The extent of a drawn pose, with no browser. What matters: the body at rest reaches half its width each way and its height plus the
 * hover above the floor; a lean turns it about its bottom tip; a hand reaches by its corners; facing left folds the extent so the front is
 * still the side Flint faces; an arc of a path is followed along its curve, not only its end points.
 */
import { expect, test } from 'bun:test';

import { NEUTRAL_POSE }       from '../SpritePose.ts';
import { DrawnExtentMeasure } from './DrawnExtentMeasure.ts';

test('the body at rest reaches half its width each way, and its height and hover above the floor', () => {
  expect(DrawnExtentMeasure.drawnExtentOf(NEUTRAL_POSE)).toEqual({
    backUnits: 20, frontUnits: 20, aboveFloorUnits: 56, belowFloorUnits: -6,
  });
});

test('a hand in front reaches by its corners, and facing left keeps it in front', () => {
  const hand = {
    cornerCount: 4, centreX: 30, centreY: -20, radius: 5, turnDegrees: 0, placement: 'eased',
  } as const;
  const right = DrawnExtentMeasure.drawnExtentOf({ ...NEUTRAL_POSE, nearHand: hand });
  const left = DrawnExtentMeasure.drawnExtentOf({ ...NEUTRAL_POSE, nearHand: hand, body: { ...NEUTRAL_POSE.body, facing: -1 } });
  expect(right.frontUnits).toBeCloseTo(35);
  expect(left).toEqual(right);
});

test('a lean turns the body about its bottom tip', () => {
  const leaned = DrawnExtentMeasure.drawnExtentOf({ ...NEUTRAL_POSE, body: { ...NEUTRAL_POSE.body, leanDegrees: 90 } });
  expect(leaned.frontUnits).toBeCloseTo(50);
  expect(leaned.belowFloorUnits).toBeCloseTo(14);
});

test('an arc is followed along its curve', () => {
  const points = DrawnExtentMeasure.pathPointsOf('M0 0 A10 10 0 0 1 20 0');
  expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(-10, 1);
});
