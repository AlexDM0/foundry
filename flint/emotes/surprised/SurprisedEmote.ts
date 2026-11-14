/** Implements `02-animations.md`, "Emotes", the Surprised row: wide eyes, one hop, and the "!" of `01-character.md`. */
import { emoteDefinition }  from '../EmoteDefinition.ts';
import { EmoteMarkUtil }    from '../EmoteMarkUtil.ts';
import { SURPRISED_MOTION } from './constants/SurprisedValues.ts';

const { DURATION_MILLISECONDS } = SURPRISED_MOTION;

export const SURPRISED_EMOTE = emoteDefinition({
  name:                 'surprised',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { height: SURPRISED_MOTION.EYE_HEIGHT_UNITS },
    body:      { addedLift: EmoteMarkUtil.hopLiftOf(input) },
    emoteMark: { ...EmoteMarkUtil.leavingMarkOf('exclamation', input, DURATION_MILLISECONDS), innerScaleX: EmoteMarkUtil.entranceSpringOf(input) },
  }),
});
