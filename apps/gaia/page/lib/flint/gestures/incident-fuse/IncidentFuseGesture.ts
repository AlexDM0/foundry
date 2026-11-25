/**
 * Incident fuse: a fuse burns down to an incident's envelope while Flint watches the flame, looks at
 * the user now and then, and grows nervous in the last of the burn; the flame goes out in smoke, and Flint does the default move: it
 * stamps the envelope with the fall and the seal of Make a ticket. Then the props fade.
 */
import type { EmoteMarkPoseOf, PosePart }  from '../../SpritePose.ts';
import { BODY_SHAPE }                      from '../../constants/BodyShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureMarkUtil }                 from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { stampingHandAt }                  from '../StampingHand.ts';
import type { StampTimeline }              from '../StampingHand.ts';
import type { IncidentFuseState }          from './IncidentFuseProp.ts';
import {
  FLAME_SHAPE,
  INCIDENT_BODY,
  INCIDENT_EYES,
  INCIDENT_FUSE_EXTENT,
  INCIDENT_FUSE_TIMELINE,
  INCIDENT_STAMP,
} from './constants/IncidentFuseValues.ts';

const { progressBetween } = GestureTimelineUtil;

const NERVOUS_STARTS_MILLISECONDS = INCIDENT_FUSE_TIMELINE.NERVOUS_FROM_BURN * INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS;
const SMOKE_ENDS_MILLISECONDS = INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS + INCIDENT_FUSE_TIMELINE.SMOKE_MILLISECONDS;

function fuseAt(timeInCycle: number): IncidentFuseState {
  const burn = progressBetween(timeInCycle, 0, INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS);
  const isSealed = timeInCycle >= INCIDENT_FUSE_TIMELINE.SEALED_MILLISECONDS;
  const isJolted = isSealed && timeInCycle < INCIDENT_FUSE_TIMELINE.JOLT_ENDS_MILLISECONDS;
  const isBurning = timeInCycle < INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS;
  return {
    shown:        1,
    cycleOpacity: Math.min(
      progressBetween(timeInCycle, 0, INCIDENT_FUSE_TIMELINE.FADE_IN_MILLISECONDS),
      1 - progressBetween(timeInCycle, INCIDENT_FUSE_TIMELINE.FADE_STARTS_MILLISECONDS, INCIDENT_FUSE_TIMELINE.CYCLE_MILLISECONDS),
    ),
    burn,
    flameScale:    isBurning ? 1 + (FLAME_SHAPE.PULSE * Math.sin(timeInCycle / FLAME_SHAPE.PULSE_DIVISOR_MILLISECONDS)) : 0,
    smokeProgress: progressBetween(timeInCycle, INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS, SMOKE_ENDS_MILLISECONDS),
    sealShown:     isSealed,
    offsetY:       isJolted ? INCIDENT_STAMP.JOLT_UNITS : 0,
  };
}

const SEAL = Object.freeze({ x: INCIDENT_STAMP.SEAL_CENTRE_X_UNITS, y: INCIDENT_STAMP.SEAL_CENTRE_Y_UNITS });

const STAMP_TIMELINE: StampTimeline = Object.freeze({
  fallStartsMilliseconds: INCIDENT_FUSE_TIMELINE.STAMP_RAISED_MILLISECONDS,
  sealedMilliseconds:     INCIDENT_FUSE_TIMELINE.SEALED_MILLISECONDS,
  joltEndsMilliseconds:   INCIDENT_FUSE_TIMELINE.JOLT_ENDS_MILLISECONDS,
  liftEndsMilliseconds:   INCIDENT_FUSE_TIMELINE.STAMP_LIFTED_MILLISECONDS,
});

/** The beads of the Nervous emote from the start of the nerves, leaving with their mark in the last moment of the burn. */
function sweatBeadsAt(timeInCycle: number): EmoteMarkPoseOf<'sweat-beads'> | null {
  return GestureMarkUtil.sweatBeadsIn(timeInCycle, { startMilliseconds: NERVOUS_STARTS_MILLISECONDS, endMilliseconds: INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS });
}

/** Flint watches the flame down the fuse; it looks at the user now and then; in the last of the burn its eyes dart and it shivers. */
function watchingPartOf(timeInCycle: number, burn: number): PosePart {
  const isNervous = timeInCycle >= NERVOUS_STARTS_MILLISECONDS;
  const isLookingAtUser = timeInCycle >= INCIDENT_FUSE_TIMELINE.LOOK_INTERVAL_MILLISECONDS
    && timeInCycle % INCIDENT_FUSE_TIMELINE.LOOK_INTERVAL_MILLISECONDS < INCIDENT_FUSE_TIMELINE.LOOK_MILLISECONDS;
  const darts = INCIDENT_EYES.NERVOUS_SHIFTS_UNITS;
  const dartShift = darts[Math.floor((timeInCycle - NERVOUS_STARTS_MILLISECONDS) / INCIDENT_EYES.NERVOUS_DART_MILLISECONDS) % darts.length] ?? darts[0];
  const watchingShift = isLookingAtUser ? INCIDENT_EYES.LOOKING_AT_USER_SHIFT_UNITS : INCIDENT_EYES.WATCHING_SHIFT_UNITS;
  return {
    eyes: {
      height: INCIDENT_EYES.WATCHING_HEIGHT_UNITS,
      shift:  isNervous ? dartShift : watchingShift,
      lift:   INCIDENT_EYES.WATCHING_FIRST_LIFT_UNITS * (1 - burn),
    },
    nearHand: null,
    ...(isNervous ? {
      body:      { addedShake: INCIDENT_BODY.NERVOUS_SHAKE_UNITS * Math.sin(timeInCycle / INCIDENT_BODY.NERVOUS_SHAKE_DIVISOR_MILLISECONDS) },
      emoteMark: sweatBeadsAt(timeInCycle),
    } : {}),
  };
}

function stampingPartOf(timeInCycle: number): PosePart {
  const isStamping = timeInCycle < INCIDENT_FUSE_TIMELINE.STAMP_LEAVES_MILLISECONDS;
  return {
    body:     isStamping ? { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES } : {},
    eyes:     { height: INCIDENT_EYES.STAMPING_HEIGHT_UNITS, ...(isStamping ? { shift: INCIDENT_EYES.STAMPING_SHIFT_UNITS } : {}) },
    nearHand: isStamping ? stampingHandAt(timeInCycle, SEAL, INCIDENT_STAMP.RAISED_Y_UNITS, STAMP_TIMELINE) : null,
  };
}

function incidentFusePartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, INCIDENT_FUSE_TIMELINE.CYCLE_MILLISECONDS);
  const fuse = fuseAt(timeInCycle);
  const isBurning = timeInCycle < INCIDENT_FUSE_TIMELINE.BURN_ENDS_MILLISECONDS;
  return {
    ...(isBurning ? watchingPartOf(timeInCycle, fuse.burn) : stampingPartOf(timeInCycle)),
    farHand: null,
    props:   { incidentFuse: fuse },
  };
}

export const INCIDENT_FUSE_GESTURE = gestureDefinition({
  name:                  'incident-fuse',
  intents:               { 'incident-fuse': singleFormOf(null, INCIDENT_FUSE_TIMELINE.STILL_MOMENT_MILLISECONDS, INCIDENT_FUSE_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            incidentFusePartOf,
});
