/** The small curves every animation is written in, shared so that each gesture and emote reads them alike. */
import type { Point }              from '../SpriteGeometry.ts';
import { MILLISECONDS_PER_SECOND } from '../constants/Easing.ts';
import { ANGLE }                   from '../constants/HandShape.ts';
import { SPRING }                  from '../constants/Motion.ts';

export const AnimationCurveUtil = Object.freeze({
  /** The value held between the bounds; `clamp(x)` alone holds it between 0 and 1. */
  clamp: (value: number, lowest = 0, highest = 1): number => Math.min(highest, Math.max(lowest, value)),

  /** Where a time is within its repeating cycle, from 0 up to but never 1. */
  cycleProgressOf: (milliseconds: number, cycleMilliseconds: number): number => {
    const progress = (milliseconds % cycleMilliseconds) / cycleMilliseconds;
    return progress < 0 ? progress + 1 : progress;
  },

  /** The spring of an emote mark's entrance: 0 before it starts, 1 once it is done, and an overshoot between. */
  springScaleAt: (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    return (2 ** (-SPRING.DECAY_PER_PROGRESS * progress)) * Math.sin(((SPRING.DECAY_PER_PROGRESS * progress) - SPRING.PHASE_OFFSET) * SPRING.ANGULAR_STEP_RADIANS) + 1;
  },

  radiansOf: (degrees: number): number => (degrees * Math.PI) / ANGLE.HALF_TURN_DEGREES,

  /** The share of the remaining distance that one easing step of this length covers at this rate. */
  easingFractionOf: (ratePerSecond: number, deltaMilliseconds: number): number => 1 - Math.exp(-ratePerSecond * (deltaMilliseconds / MILLISECONDS_PER_SECOND)),

  /** The value this share of the way from one value to another: the first at 0, the second at 1; a share outside 0 to 1 goes past them. */
  interpolated: (from: number, to: number, share: number): number => from + ((to - from) * share),

  /** The point this share of the way along the straight line from one point to another. */
  interpolatedPoint: (from: Point, to: Point, share: number): Point => ({ x: from.x + ((to.x - from.x) * share), y: from.y + ((to.y - from.y) * share) }),
});
