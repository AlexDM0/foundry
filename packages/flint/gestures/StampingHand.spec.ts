/**
 * The stamp. What matters: a square of radius 6 turned 45 degrees above the seal, eased while it falls; from the seal on it is placed
 * exactly on the seal, so it lands there on the frame of the seal, and then it lifts 10 units by the end of the lift.
 */
import { expect, test } from 'bun:test';

import { stampingHandAt } from './StampingHand.ts';

const SEAL = { x: 43, y: -15 };
const TIMELINE = {
  fallStartsMilliseconds: 2000, sealedMilliseconds: 2120, joltEndsMilliseconds: 2250, liftEndsMilliseconds: 2400,
};

test('raised above the seal before the fall, eased', () => {
  expect(stampingHandAt(1900, SEAL, -52, TIMELINE)).toEqual({
    cornerCount: 4, centreX: 43, centreY: -52, radius: 6, turnDegrees: 45, placement: 'eased',
  });
  expect(stampingHandAt(2060, SEAL, -52, TIMELINE).centreY).toBeCloseTo(-33.5, 9);
});

test('placed exactly on the seal from the seal on, then lifted 10 units', () => {
  expect(stampingHandAt(2120, SEAL, -52, TIMELINE)).toMatchObject({ centreY: -15, placement: 'exact-position' });
  expect(stampingHandAt(2400, SEAL, -52, TIMELINE).centreY).toBe(-25);
});
