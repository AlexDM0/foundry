/** Implements `02-animations.md`, "Emotes", the Doubt row: one narrowed eye, a lean back, and the "?" of `01-character.md`. */
import { EMOTE_DURATIONS_MILLISECONDS } from '../constants/EmoteDurations.ts';
import { DOUBT_MOTION }                 from '../constants/EmoteMotion.ts';
import type { EmoteDefinition }         from './EmoteDefinition.ts';
import { EmoteMarkUtil }                from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.doubt;

export const DOUBT_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'doubt',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { rightHeightOverride: DOUBT_MOTION.RIGHT_EYE_HEIGHT_UNITS },
    body:      { addedLeanDegrees: DOUBT_MOTION.ADDED_LEAN_DEGREES },
    emoteMark: { ...EmoteMarkUtil.leavingMarkOf('question', input, DURATION_MILLISECONDS), innerScaleX: EmoteMarkUtil.entranceSpringOf(input) },
  }),
});
