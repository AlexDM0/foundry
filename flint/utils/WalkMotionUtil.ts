/** Walking of `02-animations.md`: a steady speed along the floor, and the wobble of the body height while Flint walks. */
import { MILLISECONDS_PER_SECOND } from '../constants/Easing.ts';
import { WALK }                    from '../constants/Motion.ts';

/** -1 walks left, 1 walks right, 0 stands. */
export type WalkDirection = -1 | 0 | 1;

export const WalkMotionUtil = Object.freeze({
  /** The position after one frame, held between the floor's ends; a floor narrower than Flint holds it in its middle. */
  positionAfterStep: (positionX: number, direction: WalkDirection, deltaMilliseconds: number, lowestX: number, highestX: number): number => {
    const moved = positionX + (direction * WALK.SPEED_UNITS_PER_SECOND * (deltaMilliseconds / MILLISECONDS_PER_SECOND));
    if (lowestX > highestX) return (lowestX + highestX) / 2;
    return Math.min(highestX, Math.max(lowestX, moved));
  },

  wobbleHeightFactorAt: (elapsedMilliseconds: number): number => 1 + (WALK.WOBBLE_FACTOR * Math.sin(elapsedMilliseconds / WALK.WOBBLE_DIVISOR_MILLISECONDS)),
});
