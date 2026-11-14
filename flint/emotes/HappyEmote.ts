/** Implements `02-animations.md`, "Emotes", the Happy row: the happy eyes, two bounces, and the two glints of `01-character.md`. */
import { EMOTE_DURATIONS_MILLISECONDS }     from '../constants/EmoteDurations.ts';
import { HAPPY_MOTION }                     from '../constants/EmoteMotion.ts';
import type { EmoteDefinition, EmoteInput } from './EmoteDefinition.ts';
import { EmoteMarkUtil }                    from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.happy;

function bounceLiftOf(input: EmoteInput): number {
  if (input.reducedMotion || input.ageMilliseconds >= HAPPY_MOTION.BOUNCE_MILLISECONDS) return 0;
  return HAPPY_MOTION.BOUNCE_HEIGHT_UNITS * Math.abs(Math.sin((Math.PI * input.ageMilliseconds) / HAPPY_MOTION.BOUNCE_HALF_PERIOD_MILLISECONDS));
}

export const HAPPY_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'happy',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { happiness: 1 },
    body:      { addedLift: bounceLiftOf(input) },
    emoteMark: { ...EmoteMarkUtil.leavingMarkOf('happy-glints', input, DURATION_MILLISECONDS), innerScaleX: EmoteMarkUtil.entranceSpringOf(input) },
  }),
});
