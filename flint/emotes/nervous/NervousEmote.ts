/**
 * Implements `02-animations.md`, "Emotes", the Nervous row: narrow darting eyes, a shiver, and the sweat beads of `01-character.md` that
 * fly off one after another. A carried Flint (`flint/emotes/nervous/CarriedPose.ts`) shows the same nerves for as long as the drag goes on.
 */
import type { EmoteMarkPoseOf, PosePart } from '../../SpritePose.ts';
import type { EmoteInput }                from '../EmoteDefinition.ts';
import { emoteDefinition }                from '../EmoteDefinition.ts';
import { EmoteMarkUtil }                  from '../EmoteMarkUtil.ts';
import { NERVOUS_MOTION }                 from './constants/NervousValues.ts';

const { DURATION_MILLISECONDS } = NERVOUS_MOTION;

function eyeShiftAt(ageMilliseconds: number): number {
  const shifts = NERVOUS_MOTION.EYE_SHIFTS_UNITS;
  return shifts[Math.floor(ageMilliseconds / NERVOUS_MOTION.EYE_DART_MILLISECONDS) % shifts.length] ?? shifts[0];
}

/** The eyes, the shiver and the beads of nerves, on the sweat-beads mark the caller gives (fading for the emote, steady while carried). */
export function nervousPartOf(input: EmoteInput, mark: EmoteMarkPoseOf<'sweat-beads'>): PosePart {
  return {
    eyes:      { height: NERVOUS_MOTION.EYE_HEIGHT_UNITS, shift: eyeShiftAt(input.ageMilliseconds) },
    body:      { addedShake: input.reducedMotion ? 0 : NERVOUS_MOTION.SHAKE_UNITS * Math.sin(input.ageMilliseconds / NERVOUS_MOTION.SHAKE_DIVISOR_MILLISECONDS) },
    emoteMark: { ...mark, details: { beads: EmoteMarkUtil.sweatBeadsFlightOf(input) } },
  };
}

export const NERVOUS_EMOTE = emoteDefinition({
  name:                 'nervous',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => nervousPartOf(input, EmoteMarkUtil.leavingMarkOf('sweat-beads', input, DURATION_MILLISECONDS)),
});
