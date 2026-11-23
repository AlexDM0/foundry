/** The Doubt emote: one narrowed eye, a lean back, and the "?". */
import { emoteDefinition } from '../EmoteDefinition.ts';
import { EmoteMarkUtil }   from '../EmoteMarkUtil.ts';
import { DOUBT_MOTION }    from './constants/DoubtValues.ts';

const { DURATION_MILLISECONDS } = DOUBT_MOTION;

export const DOUBT_EMOTE = emoteDefinition({
  name:                 'doubt',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { rightHeightOverride: DOUBT_MOTION.RIGHT_EYE_HEIGHT_UNITS },
    body:      { addedLeanDegrees: DOUBT_MOTION.ADDED_LEAN_DEGREES },
    emoteMark: EmoteMarkUtil.springingMarkOf('question', input, DURATION_MILLISECONDS),
  }),
});
