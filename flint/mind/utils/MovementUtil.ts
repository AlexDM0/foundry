/** A steady move towards a point along the floor, at a speed in units per second, which never overshoots. */
import type { Facing }             from '../../SpritePose.ts';
import { MILLISECONDS_PER_SECOND } from '../../constants/Easing.ts';
import type { WalkDirection }      from '../../utils/WalkMotionUtil.ts';

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
});
