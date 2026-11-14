/**
 * Implements `02-animations.md`, "Emotes", the Idea row: wide eyes, one hop, and the lightbulb of `01-character.md`, whose rays show and
 * flicker after a moment. Under reduced motion the rays show without the flicker.
 */
import { EMOTE_DURATIONS_MILLISECONDS }     from '../constants/EmoteDurations.ts';
import { IDEA_MOTION }                      from '../constants/EmoteMotion.ts';
import type { EmoteDefinition, EmoteInput } from './EmoteDefinition.ts';
import { EmoteMarkUtil }                    from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.idea;

function raysOpacityOf(input: EmoteInput): number {
  if (input.ageMilliseconds <= IDEA_MOTION.RAYS_START_MILLISECONDS) return 0;
  if (input.reducedMotion) return IDEA_MOTION.RAYS_OPACITY;
  return IDEA_MOTION.RAYS_OPACITY + (IDEA_MOTION.RAYS_FLICKER_OPACITY * Math.sin(input.ageMilliseconds / IDEA_MOTION.RAYS_FLICKER_DIVISOR_MILLISECONDS));
}

export const IDEA_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'idea',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => {
    const innerScale = EmoteMarkUtil.entranceSpringOf(input);
    return {
      eyes:      { height: IDEA_MOTION.EYE_HEIGHT_UNITS },
      body:      { addedLift: EmoteMarkUtil.hopLiftOf(input) },
      emoteMark: {
        ...EmoteMarkUtil.leavingMarkOf('lightbulb', input, DURATION_MILLISECONDS), innerScaleX: innerScale, innerScaleY: innerScale, lightbulbRaysOpacity: raysOpacityOf(input),
      },
    };
  },
});
