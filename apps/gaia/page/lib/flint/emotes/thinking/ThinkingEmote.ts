/** The Thinking emote: the eyes look up, and the thinking dots show one by one. */
import { emoteDefinition } from '../EmoteDefinition.ts';
import { EmoteMarkUtil }   from '../EmoteMarkUtil.ts';
import { THINKING_MOTION } from './constants/ThinkingValues.ts';

const { DURATION_MILLISECONDS } = THINKING_MOTION;

export const THINKING_EMOTE = emoteDefinition({
  name:                 'thinking',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { lift: THINKING_MOTION.EYE_LIFT_UNITS, shift: THINKING_MOTION.EYE_SHIFT_UNITS },
    emoteMark: EmoteMarkUtil.thinkingDotsOf(input, DURATION_MILLISECONDS),
  }),
});
