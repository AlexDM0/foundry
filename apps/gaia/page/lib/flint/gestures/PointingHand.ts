/** The hand of Point (`02-animations.md`, "Point"), which every gesture that points shares: a triangle that points forward and swings. */
import type { HandPose } from '../SpritePose.ts';
import { HAND_SHAPE }    from '../constants/HandShape.ts';
import { POINTING_HAND } from './constants/PointingHand.ts';

export function pointingHandAt(elapsedMilliseconds: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.POINTING_CORNER_COUNT,
    centreX:     POINTING_HAND.CENTRE_X_UNITS + (POINTING_HAND.SWING_UNITS * Math.sin(elapsedMilliseconds / POINTING_HAND.SWING_DIVISOR_MILLISECONDS)),
    centreY:     POINTING_HAND.CENTRE_Y_UNITS,
    radius:      POINTING_HAND.RADIUS_UNITS,
    turnDegrees: POINTING_HAND.TURN_DEGREES,
    placement:   'eased',
  };
}
