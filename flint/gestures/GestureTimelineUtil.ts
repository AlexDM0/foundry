/** The timeline of a cyclic gesture: where a time is in its cycle, and how far a phase of the cycle has run. */
import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';

export const GestureTimelineUtil = Object.freeze({
  /** The time since the current cycle started; the gesture's time is never negative. */
  timeInCycleOf: (elapsedMilliseconds: number, cycleMilliseconds: number): number => elapsedMilliseconds % cycleMilliseconds,

  /** 0 before the phase starts, 1 once it ends, and straight between. */
  progressBetween: (timeInCycle: number, startMilliseconds: number, endMilliseconds: number): number => AnimationCurveUtil.clamp(
    (timeInCycle - startMilliseconds) / (endMilliseconds - startMilliseconds),
  ),
});
