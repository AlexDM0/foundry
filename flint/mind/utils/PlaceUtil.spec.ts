/**
 * Where Flint can stand. What matters: the floor holds Flint half a body inside each end, and a floor narrower than Flint holds it in the
 * middle; the place it lives is its habitat's box or its home's; the edge and the inside of a box are read alike for every caller.
 */
import { expect, test } from 'bun:test';

import { INITIAL_MIND_STATE }               from '../../SpriteMind.ts';
import { CHAT_BOX, HOME_BOX, perceptionOf } from '../../testing/MindRun.ts';
import { PlaceUtil }                        from './PlaceUtil.ts';

const NARROW = {
  leftX: 0, rightX: 30, topY: 0, floorY: 50,
};

test('the floor holds Flint half a body inside each end, and a narrow floor holds it in the middle', () => {
  expect([PlaceUtil.clampedToFloor(0, CHAT_BOX), PlaceUtil.clampedToFloor(9999, CHAT_BOX), PlaceUtil.clampedToFloor(400, CHAT_BOX)]).toEqual([220, 580, 400]);
  expect(PlaceUtil.standingRangeOf(NARROW)).toEqual({ lowestX: 15, highestX: 15 });
  expect(PlaceUtil.middleOf(CHAT_BOX)).toBe(400);
});

test('the place Flint lives is its habitat\'s box, or its home\'s; a habitat that is gone gives none', () => {
  expect(PlaceUtil.boxWhereFlintLives(INITIAL_MIND_STATE, perceptionOf())).toEqual(HOME_BOX);
  expect(PlaceUtil.boxWhereFlintLives({ ...INITIAL_MIND_STATE, livesIn: 'chat' }, perceptionOf())).toEqual(CHAT_BOX);
  expect(PlaceUtil.boxWhereFlintLives({ ...INITIAL_MIND_STATE, livesIn: 'gone' }, perceptionOf())).toBeNull();
  expect(PlaceUtil.habitatById(perceptionOf(), null)).toBeNull();
});

test('an edge is the right or the left side of the box, and the inside holds its sides', () => {
  expect([PlaceUtil.edgeXOf(CHAT_BOX, 1), PlaceUtil.edgeXOf(CHAT_BOX, -1)]).toEqual([600, 200]);
  expect([PlaceUtil.isInside(CHAT_BOX, 200, 500), PlaceUtil.isInside(CHAT_BOX, 199, 300)]).toEqual([true, false]);
});
