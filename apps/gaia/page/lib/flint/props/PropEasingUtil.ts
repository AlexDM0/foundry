/** The easing a prop gets by default, and the one step a prop's own easing builds on. */
import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';
import type { PropState }     from './PropDefinition.ts';

const easedTowards = AnimationCurveUtil.interpolated;

export const PropEasingUtil = Object.freeze({
  easedTowards,

  /** Only the shown level eases; a prop the target no longer shows keeps its last drawn state while it fades. */
  easedShownLevelOf: <State extends PropState>(drawn: State, target: State, handFraction: number): State => {
    const shown = easedTowards(drawn.shown, target.shown, handFraction);
    return target.shown === 0 ? { ...drawn, shown } : { ...target, shown };
  },
});
