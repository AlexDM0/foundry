/**
 * A steady move towards a point along the floor, at a speed in units per second, which never overshoots; and a floor that changes at the
 * body rate.
 */
import type { Facing }                                      from '../../SpriteGeometry.ts';
import { EASING_RATES_PER_SECOND, MILLISECONDS_PER_SECOND } from '../../constants/Easing.ts';
import { FLOOR_CHANGE }                                     from '../../constants/Motion.ts';
import { AnimationCurveUtil }                               from '../../utils/AnimationCurveUtil.ts';
import type { WalkDirection }                               from '../../utils/WalkMotionUtil.ts';

/** A floor moves towards a goal at the body rate, and is there once it is within the tolerance. */
function floorTowards(floorY: number, goalY: number, deltaMilliseconds: number): number {
  const eased = floorY + ((goalY - floorY) * AnimationCurveUtil.easingFractionOf(EASING_RATES_PER_SECOND.BODY, deltaMilliseconds));
  return Math.abs(goalY - eased) <= FLOOR_CHANGE.ARRIVED_WITHIN_UNITS ? goalY : eased;
}

export const MovementUtil = Object.freeze({
  stepToward: (positionX: number, targetX: number, speedUnitsPerSecond: number, deltaMilliseconds: number): number => {
    const step = speedUnitsPerSecond * (deltaMilliseconds / MILLISECONDS_PER_SECOND);
    if (Math.abs(targetX - positionX) <= step) return targetX;
    return positionX + (Math.sign(targetX - positionX) * step);
  },

  directionToward: (positionX: number, targetX: number): WalkDirection => {
    if (targetX > positionX) return 1;
    if (targetX < positionX) return -1;
    return 0;
  },

  /** The facing towards a point; on the point itself, the facing Flint has. */
  facingToward: (positionX: number, targetX: number, currentFacing: Facing): Facing => {
    if (targetX > positionX) return 1;
    if (targetX < positionX) return -1;
    return currentFacing;
  },

  floorTowards,

  /** How far Flint stands above the floor of a box, as a behaviour that raised it left it; never below the floor. */
  liftAbove: (floorY: number, boxFloorY: number): number => Math.max(0, boxFloorY - floorY),

  /**
   * A lift above the floor after a frame: it comes down at the body rate, and at once under reduced motion. Flint's floor is the box's
   * floor less the lift, so the floor still follows its box at once when the page scrolls.
   */
  loweredLiftOf: (liftUnits: number, deltaMilliseconds: number, reducedMotion: boolean): number => (reducedMotion ? 0 : floorTowards(liftUnits, 0, deltaMilliseconds)),
});
