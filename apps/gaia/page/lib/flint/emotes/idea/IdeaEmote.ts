/**
 * The Idea emote: wide eyes, one hop, and the lightbulb, whose rays show and
 * flicker after a moment. Under reduced motion the rays show without the flicker.
 */
import type { EmoteInput } from '../EmoteDefinition.ts';
import { emoteDefinition } from '../EmoteDefinition.ts';
import { EmoteMarkUtil }   from '../EmoteMarkUtil.ts';
import { IDEA_MOTION }     from './constants/IdeaValues.ts';

const { DURATION_MILLISECONDS } = IDEA_MOTION;

function raysOpacityOf(input: EmoteInput): number {
  if (input.ageMilliseconds <= IDEA_MOTION.RAYS_START_MILLISECONDS) return 0;
  if (input.reducedMotion) return IDEA_MOTION.RAYS_OPACITY;
  return IDEA_MOTION.RAYS_OPACITY + (IDEA_MOTION.RAYS_FLICKER_OPACITY * Math.sin(input.ageMilliseconds / IDEA_MOTION.RAYS_FLICKER_DIVISOR_MILLISECONDS));
}

export const IDEA_EMOTE = emoteDefinition({
  name:                 'idea',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => {
    const innerScale = EmoteMarkUtil.entranceSpringOf(input);
    return {
      eyes:      { height: IDEA_MOTION.EYE_HEIGHT_UNITS },
      body:      { addedLift: EmoteMarkUtil.hopLiftOf(input) },
      emoteMark: {
        ...EmoteMarkUtil.leavingMarkOf('lightbulb', input, DURATION_MILLISECONDS), innerScaleX: innerScale, innerScaleY: innerScale, details: { raysOpacity: raysOpacityOf(input) },
      },
    };
  },
});
