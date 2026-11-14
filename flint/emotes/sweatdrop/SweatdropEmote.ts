/**
 * Implements `02-animations.md`, "Emotes", the Sweatdrop row: the eyes look away, and the sweat drop of `01-character.md` grows in at
 * once and slides down. Under reduced motion the drop holds still at its anchor.
 */
import { emoteDefinition }  from '../EmoteDefinition.ts';
import { EmoteMarkUtil }    from '../EmoteMarkUtil.ts';
import { SWEATDROP_MOTION } from './constants/SweatdropValues.ts';

const { DURATION_MILLISECONDS } = SWEATDROP_MOTION;

export const SWEATDROP_EMOTE = emoteDefinition({
  name:                 'sweatdrop',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { height: SWEATDROP_MOTION.EYE_HEIGHT_UNITS, shift: SWEATDROP_MOTION.EYE_SHIFT_UNITS },
    emoteMark: EmoteMarkUtil.sweatDropOf(input, DURATION_MILLISECONDS),
  }),
});
