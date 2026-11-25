/** The Annoyed emote: a glare, a short shake, and the pulsing anger vein. */
import { emoteDefinition }                                  from '../EmoteDefinition.ts';
import { EmoteMarkUtil }                                    from '../EmoteMarkUtil.ts';
import { ANGER_VEIN_PULSE, ANNOYED_EXTENT, ANNOYED_MOTION } from './constants/AnnoyedValues.ts';

const { DURATION_MILLISECONDS } = ANNOYED_MOTION;

export const ANNOYED_EMOTE = emoteDefinition({
  name:                 'annoyed',
  durationMilliseconds: DURATION_MILLISECONDS,
  extent:               ANNOYED_EXTENT,
  targetPose:           (input) => {
    const shakes = !input.reducedMotion && input.ageMilliseconds < ANNOYED_MOTION.SHAKE_MILLISECONDS;
    const pulse = input.reducedMotion ? 1 : 1 + (ANGER_VEIN_PULSE.FACTOR * Math.sin(input.ageMilliseconds / ANGER_VEIN_PULSE.DIVISOR_MILLISECONDS));
    const innerScale = EmoteMarkUtil.entranceSpringOf(input) * pulse;
    return {
      eyes:      { height: ANNOYED_MOTION.EYE_HEIGHT_UNITS, slantDegrees: ANNOYED_MOTION.SLANT_DEGREES },
      body:      { addedShake: shakes ? ANNOYED_MOTION.SHAKE_UNITS * Math.sin(input.ageMilliseconds / ANNOYED_MOTION.SHAKE_DIVISOR_MILLISECONDS) : 0 },
      emoteMark: { ...EmoteMarkUtil.leavingMarkOf('anger-vein', input, DURATION_MILLISECONDS), innerScaleX: innerScale, innerScaleY: innerScale },
    };
  },
});
