/**
 * Implements `02-animations.md`, "Emotes", the Nervous row: narrow darting eyes, a shiver, and the sweat beads of `01-character.md` that
 * fly off one after another. A carried Flint (`flint/emotes/CarriedPose.ts`) shows the same nerves for as long as the drag goes on.
 */
import type { EmoteMarkPose, PosePart, SweatBeadPose } from '../SpritePose.ts';
import { EMOTE_DURATIONS_MILLISECONDS }                from '../constants/EmoteDurations.ts';
import { NERVOUS_MOTION, SWEAT_BEAD_FLIGHT }           from '../constants/EmoteMotion.ts';
import { AnimationCurveUtil }                          from '../utils/AnimationCurveUtil.ts';
import type { EmoteDefinition, EmoteInput }            from './EmoteDefinition.ts';
import { EmoteMarkUtil }                               from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.nervous;

/** A bead shows from its start; under reduced motion it holds still at one point of its flight. */
function sweatBeadsOf(input: EmoteInput): SweatBeadPose[] {
  return SWEAT_BEAD_FLIGHT.SIDES.map((side, i) => {
    const beadMilliseconds = input.ageMilliseconds - (i * SWEAT_BEAD_FLIGHT.START_INTERVAL_MILLISECONDS);
    const hasStarted = beadMilliseconds > 0;
    const runningFlight = hasStarted ? AnimationCurveUtil.cycleProgressOf(beadMilliseconds, SWEAT_BEAD_FLIGHT.CYCLE_MILLISECONDS) : 0;
    const flight = input.reducedMotion ? SWEAT_BEAD_FLIGHT.STILL_FLIGHT : runningFlight;
    return {
      x:           side * (SWEAT_BEAD_FLIGHT.START_X_UNITS + (SWEAT_BEAD_FLIGHT.SPREAD_X_UNITS * flight)),
      y:           SWEAT_BEAD_FLIGHT.START_Y_UNITS - (SWEAT_BEAD_FLIGHT.RISE_UNITS * flight) + (SWEAT_BEAD_FLIGHT.FALL_UNITS * flight * flight),
      turnDegrees: side * SWEAT_BEAD_FLIGHT.TURN_DEGREES,
      opacity:     hasStarted ? 1 - flight : 0,
    };
  });
}

function eyeShiftAt(ageMilliseconds: number): number {
  const shifts = NERVOUS_MOTION.EYE_SHIFTS_UNITS;
  return shifts[Math.floor(ageMilliseconds / NERVOUS_MOTION.EYE_DART_MILLISECONDS) % shifts.length] ?? shifts[0];
}

/** The eyes, the shiver and the beads of nerves, on the sweat-beads mark the caller gives (fading for the emote, steady while carried). */
export function nervousPartOf(input: EmoteInput, mark: EmoteMarkPose): PosePart {
  return {
    eyes:      { height: NERVOUS_MOTION.EYE_HEIGHT_UNITS, shift: eyeShiftAt(input.ageMilliseconds) },
    body:      { addedShake: input.reducedMotion ? 0 : NERVOUS_MOTION.SHAKE_UNITS * Math.sin(input.ageMilliseconds / NERVOUS_MOTION.SHAKE_DIVISOR_MILLISECONDS) },
    emoteMark: { ...mark, sweatBeads: sweatBeadsOf(input) },
  };
}

export const NERVOUS_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'nervous',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => nervousPartOf(input, EmoteMarkUtil.leavingMarkOf('sweat-beads', input, DURATION_MILLISECONDS)),
});
