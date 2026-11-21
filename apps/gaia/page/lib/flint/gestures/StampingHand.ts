/**
 * The stamp of Make a ticket (`02-animations.md`, "Make a ticket"), which every gesture that seals shares: it rises above the seal, falls
 * onto it, and from the seal on is placed exactly, so it lands on the seal, and then it lifts.
 */
import type { Point }          from '../SpriteGeometry.ts';
import type { HandPose }       from '../SpritePose.ts';
import { GestureTimelineUtil } from './GestureTimelineUtil.ts';
import { STAMPING_HAND }       from './constants/StampingHand.ts';

/** The moments of one stamp, in the gesture's own time. */
export interface StampTimeline {
  readonly fallStartsMilliseconds: number;
  readonly sealedMilliseconds:     number;
  readonly joltEndsMilliseconds:   number;
  readonly liftEndsMilliseconds:   number;
}

export function stampingHandAt(timeInCycle: number, seal: Point, raisedYUnits: number, timeline: StampTimeline): HandPose {
  const isSealed = timeInCycle >= timeline.sealedMilliseconds;
  const fallen = GestureTimelineUtil.progressBetween(timeInCycle, timeline.fallStartsMilliseconds, timeline.sealedMilliseconds);
  const lifted = GestureTimelineUtil.progressBetween(timeInCycle, timeline.joltEndsMilliseconds, timeline.liftEndsMilliseconds);
  return {
    cornerCount: STAMPING_HAND.CORNER_COUNT,
    centreX:     seal.x,
    centreY:     isSealed ? seal.y - (STAMPING_HAND.LIFT_UNITS * lifted) : raisedYUnits + ((seal.y - raisedYUnits) * fallen),
    radius:      STAMPING_HAND.RADIUS_UNITS,
    turnDegrees: STAMPING_HAND.TURN_DEGREES,
    placement:   isSealed ? 'exact-position' : 'eased',
  };
}
