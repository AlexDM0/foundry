/** The sparks of a snap (`02-animations.md`, "Merge"), which every gesture that snaps or flares shares. */
import type { Point }           from '../SpriteGeometry.ts';
import type { SmallSparkPlace } from '../props/shapes/SparkShapeUtil.ts';
import { SNAP_SPARKS }          from './constants/SnapSparks.ts';

export const SNAP_SPARKS_CENTRE: Point = Object.freeze({ x: SNAP_SPARKS.CENTRE_X_UNITS, y: SNAP_SPARKS.CENTRE_Y_UNITS });

/** Each spark flies out on its way from the centre, turning half a turn, and fades; none shows before the snap or after the flight. */
export function snapSparksAt(sinceSnapMilliseconds: number, centre: Point = SNAP_SPARKS_CENTRE, travelFactor = 1): SmallSparkPlace[] {
  const flight = sinceSnapMilliseconds / SNAP_SPARKS.FLIGHT_MILLISECONDS;
  const isFlying = flight > 0 && flight < 1;
  return SNAP_SPARKS.WAYS.map((way) => ({
    x:           centre.x + (way.X * (SNAP_SPARKS.START_X_UNITS + (SNAP_SPARKS.TRAVEL_X_UNITS * travelFactor * flight))),
    y:           centre.y + (way.Y * (SNAP_SPARKS.START_Y_UNITS + (SNAP_SPARKS.TRAVEL_Y_UNITS * travelFactor * flight))),
    turnDegrees: SNAP_SPARKS.TURN_DEGREES * flight,
    opacity:     isFlying ? 1 - flight : 0,
  }));
}
