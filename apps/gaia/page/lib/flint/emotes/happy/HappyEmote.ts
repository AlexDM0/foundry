/** The Happy emote: the happy eyes, two bounces, and the two glints. */
import type { EmoteInput } from '../EmoteDefinition.ts';
import { emoteDefinition } from '../EmoteDefinition.ts';
import { EmoteMarkUtil }   from '../EmoteMarkUtil.ts';
import { HAPPY_MOTION }    from './constants/HappyValues.ts';

const { DURATION_MILLISECONDS } = HAPPY_MOTION;

function bounceLiftOf(input: EmoteInput): number {
  if (input.reducedMotion || input.ageMilliseconds >= HAPPY_MOTION.BOUNCE_MILLISECONDS) return 0;
  return HAPPY_MOTION.BOUNCE_HEIGHT_UNITS * Math.abs(Math.sin((Math.PI * input.ageMilliseconds) / HAPPY_MOTION.BOUNCE_HALF_PERIOD_MILLISECONDS));
}

export const HAPPY_EMOTE = emoteDefinition({
  name:                 'happy',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { happiness: 1 },
    body:      { addedLift: bounceLiftOf(input) },
    emoteMark: { ...EmoteMarkUtil.leavingMarkOf('happy-glints', input, DURATION_MILLISECONDS), innerScaleX: EmoteMarkUtil.entranceSpringOf(input) },
  }),
});
