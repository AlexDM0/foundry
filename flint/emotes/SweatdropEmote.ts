/**
 * Implements `02-animations.md`, "Emotes", the Sweatdrop row: the eyes look away, and the sweat drop of `01-character.md` grows in at
 * once and slides down. Under reduced motion the drop holds still at its anchor.
 */
import { EMOTE_DURATIONS_MILLISECONDS } from '../constants/EmoteDurations.ts';
import { SWEATDROP_MOTION }             from '../constants/EmoteMotion.ts';
import { AnimationCurveUtil }           from '../utils/AnimationCurveUtil.ts';
import type { EmoteDefinition }         from './EmoteDefinition.ts';
import { EmoteMarkUtil }                from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.sweatdrop;

export const SWEATDROP_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'sweatdrop',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => {
    const mark = EmoteMarkUtil.leavingMarkOf('sweat-drop', input, DURATION_MILLISECONDS);
    const fallen = input.reducedMotion ? 0 : AnimationCurveUtil.clamp(input.ageMilliseconds / SWEATDROP_MOTION.FALL_MILLISECONDS);
    const grown = input.reducedMotion ? 1 : AnimationCurveUtil.clamp(input.ageMilliseconds / SWEATDROP_MOTION.GROWTH_MILLISECONDS);
    const innerScale = SWEATDROP_MOTION.START_SCALE_FACTOR + ((1 - SWEATDROP_MOTION.START_SCALE_FACTOR) * grown);
    return {
      eyes:      { height: SWEATDROP_MOTION.EYE_HEIGHT_UNITS, shift: SWEATDROP_MOTION.EYE_SHIFT_UNITS },
      emoteMark: {
        ...mark, anchorY: mark.anchorY + (SWEATDROP_MOTION.FALL_UNITS * fallen), innerScaleX: innerScale, innerScaleY: innerScale,
      },
    };
  },
});
