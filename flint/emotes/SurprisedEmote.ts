/** Implements `02-animations.md`, "Emotes", the Surprised row: wide eyes, one hop, and the "!" of `01-character.md`. */
import { EMOTE_DURATIONS_MILLISECONDS } from '../constants/EmoteDurations.ts';
import { SURPRISED_MOTION }             from '../constants/EmoteMotion.ts';
import type { EmoteDefinition }         from './EmoteDefinition.ts';
import { EmoteMarkUtil }                from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.surprised;

export const SURPRISED_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'surprised',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { height: SURPRISED_MOTION.EYE_HEIGHT_UNITS },
    body:      { addedLift: EmoteMarkUtil.hopLiftOf(input) },
    emoteMark: { ...EmoteMarkUtil.leavingMarkOf('exclamation', input, DURATION_MILLISECONDS), innerScaleX: EmoteMarkUtil.entranceSpringOf(input) },
  }),
});
