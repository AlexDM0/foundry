/**
 * Plays one intent, or an attendant, through the pure mind, the pose composition and the easing, as `createFlint` does, and measures the
 * extent of everything drawn on each frame (`testing/DrawnExtentMeasure.ts`): a one action until it ends and a little after, a loop for a
 * while; under reduced motion, its still moment.
 */
import { emoteDefinitionOf, intendedGestureOf, intentMeaningOf } from '../IntentMeaning.ts';
import { easedPoseOf }                                           from '../PoseEasing.ts';
import type { DrawnExtent, Facing }                              from '../SpriteGeometry.ts';
import type { SpriteIntent }                                     from '../SpriteHabitat.ts';
import {
  INITIAL_MIND_STATE,
  mindStateAfterFrame,
  mindStateAttended,
  mindStateWithPendingIntent,
  targetPoseOfMind
} from '../SpriteMind.ts';
import type { Pose }                 from '../SpritePose.ts';
import type { AttendantName }        from '../attendants/AttendantCatalog.ts';
import { wanderAtRest }              from '../behaviours/wander/WanderBehaviour.ts';
import type { SpriteMindState }      from '../mind/MindState.ts';
import type { Perception, PlaceBox } from '../mind/Perception.ts';
import { NO_TARGET }                 from '../mind/Perception.ts';
import { GROUNDED }                  from '../utils/JumpMotionUtil.ts';
import { DrawnExtentMeasure }        from './DrawnExtentMeasure.ts';
import { FRAME_MILLISECONDS }        from './MindRun.ts';

const SETTLING_MILLISECONDS = 1000;
const LOOP_MILLISECONDS = 16000;
const REDUCED_MOTION_MILLISECONDS = 1500;
const TAIL_MILLISECONDS = 1200;

/** A room just Flint's width, so the rest never walks it away and its tail is the subject's own. */
const ROOM: PlaceBox = Object.freeze({
  leftX: 580, rightX: 620, topY: 200, floorY: 600,
});

function perceptionOf(reducedMotion: boolean): Perception {
  return {
    home:     ROOM,
    habitats: [{
      id: 'room', kind: 'room', box: ROOM, isRoomy: true, copyTarget: null, keepsFlintInside: false,
    }],
    pointer:         null,
    happenings:      [],
    cues:            [],
    storedHabitatId: null,
    stageWidthUnits: 1600,
    target:          NO_TARGET,
    reducedMotion,
  };
}

function settledState(facing: Facing): SpriteMindState {
  return {
    ...INITIAL_MIND_STATE,
    isPlaced:                true,
    livesIn:                 'room',
    mayRestoreStoredHabitat: false,
    behaviour:               wanderAtRest(0),
    motion:                  {
      positionX: (ROOM.leftX + ROOM.rightX) / 2, floorY: ROOM.floorY, facing, walkDirection: 0, jump: GROUNDED,
    },
  };
}

export type ExtentSubject = { readonly intent: SpriteIntent } | { readonly attendant: AttendantName; readonly count: number };

export interface ExtentRunRequest {
  readonly subject:       ExtentSubject;
  readonly facing:        Facing;
  readonly reducedMotion: boolean;
}

/** How long the subject plays: its duration and a tail for a one action, else a loop's length. */
function playMillisecondsOf(subject: ExtentSubject, reducedMotion: boolean): number {
  if (reducedMotion) return REDUCED_MOTION_MILLISECONDS;
  if (!('intent' in subject)) return LOOP_MILLISECONDS;
  const meaning = intentMeaningOf(subject.intent);
  if (meaning.kind === 'emote') return emoteDefinitionOf(meaning.emote).durationMilliseconds + TAIL_MILLISECONDS;
  if (meaning.kind !== 'gesture') return LOOP_MILLISECONDS;
  const duration = intendedGestureOf(meaning.intent).form.durationMilliseconds;
  return duration === null ? LOOP_MILLISECONDS : duration + TAIL_MILLISECONDS;
}

/** The union of the extents drawn on every frame the subject plays. */
export function extentOfRun(request: ExtentRunRequest): DrawnExtent {
  const perception = perceptionOf(request.reducedMotion);
  let state = settledState(request.facing);
  let elapsedMilliseconds = 0;
  let drawn: Pose | null = null;
  const step = (): Pose => {
    elapsedMilliseconds += FRAME_MILLISECONDS;
    state = mindStateAfterFrame(state, perception, { elapsedMilliseconds, deltaMilliseconds: FRAME_MILLISECONDS });
    const target = targetPoseOfMind(state, elapsedMilliseconds, request.reducedMotion);
    drawn = drawn === null ? target : easedPoseOf(drawn, target, FRAME_MILLISECONDS);
    return drawn;
  };
  while (elapsedMilliseconds < SETTLING_MILLISECONDS) step();
  const { subject } = request;
  state = 'intent' in subject
    ? mindStateWithPendingIntent(state, { intent: subject.intent, visitTargetId: null })
    : mindStateAttended(state, subject.attendant, subject.count, elapsedMilliseconds);
  const endsAt = elapsedMilliseconds + playMillisecondsOf(subject, request.reducedMotion);
  let union: DrawnExtent | null = null;
  while (elapsedMilliseconds < endsAt) {
    const extent = DrawnExtentMeasure.drawnExtentOf(step());
    union = union === null ? extent : DrawnExtentMeasure.unionOf(union, extent);
  }
  if (union === null) throw new RangeError('the subject played no frame');
  return union;
}

/** Over both facings, moving and still. */
export function extentOfSubject(subject: ExtentSubject): DrawnExtent {
  const runs = ([1, -1] as const).flatMap((facing) => [false, true].map((reducedMotion) => extentOfRun({ subject, facing, reducedMotion })));
  return runs.reduce((union, extent) => DrawnExtentMeasure.unionOf(union, extent));
}
