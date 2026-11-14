/** The small curves every animation of `02-animations.md` is written in, shared so that each gesture and emote reads them alike. */
import { ANGLE }  from '../constants/HandShape.ts';
import { SPRING } from '../constants/Motion.ts';

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
});
