/**
 * Gate run: a loop in which the four lamps of a rail run one after the other and pass while the
 * eyes follow the lamp that runs; when all have passed a tick shows and Flint is happy, then the rail fades out. No hands. A failed gate is
 * the gesture Gate failed.
 */
import type { PosePart }                                     from '../../SpritePose.ts';
import { BODY_SHAPE }                                        from '../../constants/BodyShape.ts';
import type { LampState }                                    from '../../props/shapes/LampShapeUtil.ts';
import { AnimationCurveUtil }                                from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }                   from '../GestureDefinition.ts';
import { GestureTimelineUtil }                               from '../GestureTimelineUtil.ts';
import { GATE_RAIL_SHAPE, GATE_RUN_POSE, GATE_RUN_TIMELINE } from './constants/GateRunValues.ts';

const LAST_LAMP_INDEX = GATE_RAIL_SHAPE.LAMP_X_UNITS.length - 1;

function lampStateAt(timeInCycle: number, lampIndex: number): LampState {
  const runs = GATE_RUN_TIMELINE.FIRST_LAMP_RUNS_MILLISECONDS + (GATE_RUN_TIMELINE.LAMP_STEP_MILLISECONDS * lampIndex);
  if (timeInCycle < runs) return 'off';
  return timeInCycle < runs + GATE_RUN_TIMELINE.LAMP_STEP_MILLISECONDS ? 'running' : 'passed';
}

/** The lamp that runs, or the last once all have passed; the first before any runs. */
function followedLampIndexAt(timeInCycle: number): number {
  const steps = Math.floor((timeInCycle - GATE_RUN_TIMELINE.FIRST_LAMP_RUNS_MILLISECONDS) / GATE_RUN_TIMELINE.LAMP_STEP_MILLISECONDS);
  return AnimationCurveUtil.clamp(steps, 0, LAST_LAMP_INDEX);
}

function gateRunPartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(elapsedMilliseconds, GATE_RUN_TIMELINE.CYCLE_MILLISECONDS);
  const isPassed = timeInCycle >= GATE_RUN_TIMELINE.ALL_PASSED_MILLISECONDS;
  const isHappy = isPassed && timeInCycle < GATE_RUN_TIMELINE.FADES_OUT_MILLISECONDS;
  const arriving = GestureTimelineUtil.progressBetween(timeInCycle, 0, GATE_RUN_TIMELINE.FADE_IN_MILLISECONDS);
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, GATE_RUN_TIMELINE.FADES_OUT_MILLISECONDS, GATE_RUN_TIMELINE.CYCLE_MILLISECONDS);
  return {
    body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes: {
      shift:  GATE_RUN_POSE.FIRST_LAMP_EYE_SHIFT_UNITS + followedLampIndexAt(timeInCycle),
      height: GATE_RUN_POSE.EYE_HEIGHT_UNITS,
      ...(isHappy ? { happiness: 1 } : {}),
    },
    nearHand: null,
    farHand:  null,
    props:    {
      gateRail: {
        shown:             1,
        opacity:           Math.min(arriving, 1 - leaving),
        lampStates:        GATE_RAIL_SHAPE.LAMP_X_UNITS.map((_lampX, i) => lampStateAt(timeInCycle, i)),
        pulseMilliseconds: elapsedMilliseconds,
        tickOpacity:       isPassed ? 1 : 0,
      },
    },
  };
}

export const GATE_RUN_GESTURE = gestureDefinition({
  name:                  'gate-run',
  intents:               { 'gate-run': singleFormOf(null, GATE_RUN_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            gateRunPartOf,
});
