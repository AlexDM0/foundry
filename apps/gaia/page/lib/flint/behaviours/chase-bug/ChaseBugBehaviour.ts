/**
 * Chase the bug (`chase-bug`): a bug leaves the host's element (the row or card of a delivered ticket), falls to
 * the floor of the habitat Flint lives in, and runs away from Flint; each run is slower than the last, and after the limit it runs no
 * more. Flint is surprised, walks after it with narrowed eyes, jumps when it changes side close by, and grabs for it as cursor play grabs
 * for the pointer. The grab that catches it holds it between the closed hands; a dashed line links it to the element; it shrinks away
 * between the hands into a mini sheet with a crimson dot that rises from the floor and fades, and Flint is happy and rests. The running
 * bug, the line and the ticket are page shapes; the held bug is a prop, so it moves with Flint. A drag, a new intent, or a habitat or
 * element that is gone ends the chase and its grab, and the bug fades out. Under reduced motion the bug rests close by and is caught at once.
 */
import { intendedGestureOf }       from '../../IntentMeaning.ts';
import type { Facing, Point }      from '../../SpriteGeometry.ts';
import type { PosePart }           from '../../SpritePose.ts';
import { BODY_SHAPE }              from '../../constants/BodyShape.ts';
import { MILLISECONDS_PER_SECOND } from '../../constants/Easing.ts';
import { HOVER, JUMP, WALK }       from '../../constants/Motion.ts';
import type { Shape }              from '../../drawing/Shape.ts';
import { GRAB_GESTURE }            from '../../gestures/grab/GrabGesture.ts';
import { GRAB_GESTURE_VALUES }     from '../../gestures/grab/constants/GrabValues.ts';
import type { BehaviourPart }      from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }    from '../../mind/MindState.ts';
import {
  withEmote,
  withGesture,
  withJump,
  withoutGesture,
  withWalking,
  withWokenUp
} from '../../mind/MindTransitions.ts';
import type { FrameTime, Perception, PlaceBox }               from '../../mind/Perception.ts';
import { MovementUtil }                                       from '../../mind/utils/MovementUtil.ts';
import { PlaceUtil }                                          from '../../mind/utils/PlaceUtil.ts';
import { SeededSequenceUtil }                                 from '../../mind/utils/SeededSequenceUtil.ts';
import { BugShapeUtil }                                       from '../../props/shapes/BugShapeUtil.ts';
import { BUG_SHAPE, PAPER_SHAPE }                             from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }                                 from '../../utils/AnimationCurveUtil.ts';
import { IdleMotionUtil }                                     from '../../utils/IdleMotionUtil.ts';
import type { BehaviourPartInput, BehaviourStart }            from '../BehaviourDefinition.ts';
import { behaviourDefinition }                                from '../BehaviourDefinition.ts';
import { CURSOR_PLAY }                                        from '../cursor-play/constants/CursorPlayValues.ts';
import { wanderAtRest }                                       from '../wander/WanderBehaviour.ts';
import { ChasePageShapeUtil }                                 from './ChasePageShapeUtil.ts';
import type { HeldBugState }                                  from './HeldBugProp.ts';
import { CHASE_BUG_BUG, CHASE_BUG_FLINT, CHASE_BUG_TIMELINE } from './constants/ChaseBugValues.ts';

/** The steps of Flint: it chases, it holds the caught bug, the line links the bug to its element, and the bug becomes a ticket. */
export type ChaseStep = 'chase' | 'caught' | 'link' | 'ticket';

/** What the bug does while Flint chases it. */
export type BugMotion = 'falling' | 'running' | 'resting';

export interface ChaseBugState {
  readonly name:                       'chase-bug';
  readonly startedAtMilliseconds:      number;
  readonly step:                       ChaseStep;
  readonly stepStartedAtMilliseconds:  number;
  /** The centre of the bug, in overlay units. */
  readonly bugX:                       number;
  readonly bugY:                       number;
  /** Downwards, while it falls. */
  readonly bugFallSpeedUnitsPerSecond: number;
  readonly bugMotion:                  BugMotion;
  readonly bugFacing:                  Facing;
  /** The points the running bug runs through, in order: one, or the wall and then the other side of Flint. */
  readonly runPoints:                  readonly number[];
  readonly runSpeedUnitsPerSecond:     number;
  readonly runCount:                   number;
  readonly restStartedAtMilliseconds:  number;
  /** The bottom centre of the host's element on the last frame; null when the host gave none. */
  readonly elementAnchor:              Point | null;
  /** The side of Flint the bug was on at the last frame, so a change of side is seen. */
  readonly bugSide:                    -1 | 0 | 1;
  readonly nextGrabAtMilliseconds:     number;
  readonly hasBeenAnnoyed:             boolean;
  /** Where the hands closed on the bug at the catch, relative to the bottom tip for Flint facing right; null before the catch. */
  readonly handsClosedAt:              Point | null;
  /** How far above the habitat's floor Flint still is, as a behaviour that raised it left it; it comes down at the body rate. */
  readonly liftUnits:                  number;
}

const BUG_REACH_UNITS = (BUG_SHAPE.RADIUS_UNITS + BUG_SHAPE.LEG_LENGTH_UNITS) * CHASE_BUG_BUG.SCALE;
/** The centre of a bug on the floor is this far above it: its lowest corner touches the floor. */
const BUG_HEIGHT_ABOVE_FLOOR_UNITS = BUG_SHAPE.RADIUS_UNITS * CHASE_BUG_BUG.SCALE;
const BODY_CENTRE: Point = Object.freeze({ x: 0, y: BODY_SHAPE.CENTRE_Y_UNITS });
/** The lowest corner of the mini sheet is this far below its centre. */
const MINI_SHEET_LOWEST_BELOW_CENTRE_UNITS = (Math.max(...PAPER_SHAPE.POINTS.map((point) => point.y)) - PAPER_SHAPE.CENTRE_Y_UNITS) * PAPER_SHAPE.MINI_SHEET_SCALE;

function bugFloorYOf(box: PlaceBox): number {
  return box.floorY - BUG_HEIGHT_ABOVE_FLOOR_UNITS;
}

function bugXOnFloor(positionX: number, box: PlaceBox): number {
  return AnimationCurveUtil.clamp(positionX, box.leftX + BUG_REACH_UNITS, box.rightX - BUG_REACH_UNITS);
}

function sideOf(bugX: number, flintX: number): -1 | 0 | 1 {
  return bugX > flintX ? 1 : bugX < flintX ? -1 : 0;
}

/** The anchor of the element: the middle of its bottom edge. */
function anchorOf(box: PlaceBox): Point {
  return { x: (box.leftX + box.rightX) / 2, y: box.floorY };
}

function originYOf(state: SpriteMindState, elapsedMilliseconds: number, reducedMotion: boolean): number {
  const hover = reducedMotion ? HOVER.HEIGHT_UNITS : IdleMotionUtil.hoverHeightAt(elapsedMilliseconds);
  return state.motion.floorY - state.motion.jump.height - hover;
}

/** The bug relative to Flint's bottom tip, for Flint facing right: the target of a grab. */
function grabTargetOf(state: SpriteMindState, chase: ChaseBugState, originY: number): Point {
  return { x: (chase.bugX - state.motion.positionX) * state.motion.facing, y: chase.bugY - originY };
}

/** Where the two hands of a grab close on a target: towards it from the body centre, as far as the grab reaches. */
function closedHandsAt(target: Point): Point {
  const distance = Math.max(GRAB_GESTURE_VALUES.MINIMUM_DISTANCE_UNITS, Math.hypot(target.x - BODY_CENTRE.x, target.y - BODY_CENTRE.y));
  const reach = Math.min(distance, GRAB_GESTURE_VALUES.REACH_UNITS);
  return { x: BODY_CENTRE.x + (((target.x - BODY_CENTRE.x) / distance) * reach), y: BODY_CENTRE.y + (((target.y - BODY_CENTRE.y) / distance) * reach) };
}

function enteredStep(chase: ChaseBugState, step: ChaseStep, elapsedMilliseconds: number): ChaseBugState {
  return { ...chase, step, stepStartedAtMilliseconds: elapsedMilliseconds };
}

/**
 * A run away from Flint to a point 60 to 140 from it, the distance from the seeded sequence. A point past a wall of the floor makes the bug
 * run to that wall, turn, and run past Flint to the same distance on the other side. A bug that is already that far away does not run: it
 * rests again, so a run never goes towards Flint.
 */
function plannedRun(state: SpriteMindState, chase: ChaseBugState, box: PlaceBox, elapsedMilliseconds: number): BugStep {
  const seed = SeededSequenceUtil.nextSeedOf(state.sequenceSeed);
  const distance = CHASE_BUG_BUG.RUN_SHORTEST_UNITS + (SeededSequenceUtil.fractionOf(seed) * CHASE_BUG_BUG.RUN_SPREAD_UNITS);
  const flintX = state.motion.positionX;
  const away = sideOf(chase.bugX, flintX) || state.motion.facing;
  const pointX = flintX + (away * distance);
  if (Math.abs(chase.bugX - flintX) >= distance) return { mind: state, chase: { ...chase, bugMotion: 'resting', restStartedAtMilliseconds: elapsedMilliseconds } };
  const fitsOnTheFloor = bugXOnFloor(pointX, box) === pointX;
  const wallX = bugXOnFloor(away * Number.MAX_SAFE_INTEGER, box);
  const runPoints = fitsOnTheFloor ? [pointX] : [wallX, bugXOnFloor(flintX - (away * distance), box)];
  const runSpeedUnitsPerSecond = CHASE_BUG_BUG.FIRST_RUN_SPEED_UNITS_PER_SECOND * (CHASE_BUG_BUG.NEXT_RUN_SPEED_FACTOR ** chase.runCount);
  return {
    mind:  { ...state, sequenceSeed: seed },
    chase: {
      ...chase, bugMotion: 'running', runPoints, runSpeedUnitsPerSecond, runCount: chase.runCount + 1, restStartedAtMilliseconds: elapsedMilliseconds,
    },
  };
}

/** The mind and the chase after a step of the bug: a run takes the next seed of the mind's sequence. */
export interface BugStep {
  readonly mind:  SpriteMindState;
  readonly chase: ChaseBugState;
}

/** The bug's own frame: it falls, runs through its points, or rests and runs again when Flint is close or its rest is over. */
export function bugAfterFrame(state: SpriteMindState, chase: ChaseBugState, box: PlaceBox, perception: Perception, time: FrameTime): BugStep {
  const seconds = time.deltaMilliseconds / MILLISECONDS_PER_SECOND;
  const floorY = bugFloorYOf(box);
  if (chase.bugMotion === 'falling') {
    const bugFallSpeedUnitsPerSecond = chase.bugFallSpeedUnitsPerSecond + (JUMP.GRAVITY_UNITS_PER_SECOND_SQUARED * seconds);
    const bugY = chase.bugY + (bugFallSpeedUnitsPerSecond * seconds);
    if (bugY < floorY) return { mind: state, chase: { ...chase, bugY, bugFallSpeedUnitsPerSecond } };
    return plannedRun(state, { ...chase, bugY: floorY, bugFallSpeedUnitsPerSecond: 0 }, box, time.elapsedMilliseconds);
  }
  const onFloor: ChaseBugState = { ...chase, bugY: floorY };
  if (chase.bugMotion === 'running') {
    const [nextPointX, ...laterPoints] = chase.runPoints;
    if (nextPointX === undefined) return { mind: state, chase: { ...onFloor, bugMotion: 'resting', restStartedAtMilliseconds: time.elapsedMilliseconds } };
    const bugX = MovementUtil.stepToward(chase.bugX, nextPointX, chase.runSpeedUnitsPerSecond, time.deltaMilliseconds);
    const bugFacing = MovementUtil.facingToward(chase.bugX, nextPointX, chase.bugFacing);
    const runPoints = bugX === nextPointX ? laterPoints : chase.runPoints;
    const isResting = runPoints.length === 0;
    return {
      mind:  state,
      chase: {
        ...onFloor,
        bugX,
        bugFacing,
        runPoints,
        bugMotion:                 isResting ? 'resting' : 'running',
        restStartedAtMilliseconds: isResting ? time.elapsedMilliseconds : chase.restStartedAtMilliseconds,
      },
    };
  }
  const mayRun = !perception.reducedMotion && time.elapsedMilliseconds - chase.startedAtMilliseconds < CHASE_BUG_BUG.RUNS_FOR_MILLISECONDS;
  const flintIsClose = Math.abs(state.motion.positionX - chase.bugX) < CHASE_BUG_BUG.RUNS_AGAIN_WITHIN_UNITS;
  const restIsOver = time.elapsedMilliseconds - chase.restStartedAtMilliseconds >= CHASE_BUG_BUG.REST_MILLISECONDS;
  if (mayRun && (flintIsClose || restIsOver)) return plannedRun(state, onFloor, box, time.elapsedMilliseconds);
  return { mind: state, chase: onFloor };
}

/** The chase ends in the rest, and so does the grab it started. */
function chaseEnded(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return withWalking({ ...withoutGesture(state), behaviour: wanderAtRest(elapsedMilliseconds) }, 0);
}

/**
 * The bug comes from the bottom centre of the host's element, clamped sideways to the floor, and falls; with no element it starts ahead of
 * Flint on the floor. Under reduced motion it rests close ahead. A chase needs a floor, and an element that is still on the page.
 */
export function chaseBugStarted(state: SpriteMindState, start: BehaviourStart): SpriteMindState {
  const { perception, elapsedMilliseconds } = start;
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  const { target } = perception;
  if (box === null || target.kind === 'gone') return state;
  const elementAnchor = target.kind === 'on-the-page' ? anchorOf(target.box) : null;
  const flintX = state.motion.positionX;
  const { facing } = state.motion;
  const aheadUnits = perception.reducedMotion ? CHASE_BUG_BUG.STILL_AHEAD_UNITS : CHASE_BUG_BUG.START_AHEAD_UNITS;
  const fromElement = elementAnchor !== null && !perception.reducedMotion;
  const bugX = bugXOnFloor(fromElement ? elementAnchor.x : flintX + (facing * aheadUnits), box);
  const bugY = fromElement ? Math.min(elementAnchor.y, bugFloorYOf(box)) : bugFloorYOf(box);
  const chase: ChaseBugState = {
    name:                       'chase-bug',
    startedAtMilliseconds:      elapsedMilliseconds,
    step:                       'chase',
    stepStartedAtMilliseconds:  elapsedMilliseconds,
    bugX,
    bugY,
    bugFallSpeedUnitsPerSecond: 0,
    bugMotion:                  fromElement ? 'falling' : 'resting',
    bugFacing:                  sideOf(bugX, flintX) || facing,
    runPoints:                  [],
    runCount:                   0,
    runSpeedUnitsPerSecond:     CHASE_BUG_BUG.FIRST_RUN_SPEED_UNITS_PER_SECOND,
    // A bug that starts on the floor runs at once: its rest is already over.
    restStartedAtMilliseconds:  elapsedMilliseconds - CHASE_BUG_BUG.REST_MILLISECONDS,
    elementAnchor,
    bugSide:                    sideOf(bugX, flintX),
    nextGrabAtMilliseconds:     elapsedMilliseconds,
    hasBeenAnnoyed:             false,
    handsClosedAt:              null,
    liftUnits:                  perception.reducedMotion ? 0 : MovementUtil.liftAbove(state.motion.floorY, box.floorY),
  };
  const surprised = withEmote(withoutGesture(withWokenUp(state, elapsedMilliseconds)), 'surprised', elapsedMilliseconds);
  return {
    ...surprised,
    behaviour:               chase,
    motion:                  { ...surprised.motion, facing: MovementUtil.facingToward(flintX, bugX, facing), floorY: box.floorY - chase.liftUnits },
    mayRestoreStoredHabitat: false,
  };
}

/** Flint walks to the bug, jumps when it changes side close by, and grabs for it within the catch distance, with a pause after a grab. */
function chasingAfterFrame(state: SpriteMindState, chase: ChaseBugState, box: PlaceBox, perception: Perception, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds } = time;
  const { motion } = state;
  const facing = MovementUtil.facingToward(motion.positionX, chase.bugX, motion.facing);
  let next: SpriteMindState = { ...state, motion: { ...motion, facing } };
  const sidewaysUnits = chase.bugX - motion.positionX;
  const walkToX = PlaceUtil.clampedToFloor(chase.bugX, box);
  if (!perception.reducedMotion && Math.abs(sidewaysUnits) > CHASE_BUG_FLINT.STOPS_WITHIN_UNITS && walkToX !== motion.positionX) {
    next = withWalking(next, MovementUtil.directionToward(motion.positionX, walkToX));
    next = { ...next, motion: { ...next.motion, positionX: MovementUtil.stepToward(motion.positionX, walkToX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds) } };
  } else {
    next = withWalking(next, 0);
  }
  const bugSide = sideOf(chase.bugX, next.motion.positionX);
  const changedSide = chase.bugSide !== 0 && bugSide !== 0 && bugSide !== chase.bugSide;
  if (!perception.reducedMotion && changedSide && Math.abs(sidewaysUnits) <= CHASE_BUG_FLINT.JUMPS_WITHIN_UNITS) next = withJump(next);
  let moved: ChaseBugState = { ...chase, bugSide };

  const target = grabTargetOf(next, moved, originYOf(next, elapsedMilliseconds, perception.reducedMotion));
  if (next.gesture?.intent === 'grab') {
    if (next.gesture.verdict === false && !moved.hasBeenAnnoyed) {
      next = withEmote(next, 'annoyed', elapsedMilliseconds);
      moved = { ...moved, hasBeenAnnoyed: true };
    }
    return { ...withGesture(next, 'grab', elapsedMilliseconds, target), behaviour: moved };
  }
  const isWithinCatch = Math.hypot(target.x - BODY_CENTRE.x, target.y - BODY_CENTRE.y) <= GRAB_GESTURE_VALUES.CATCH_DISTANCE_UNITS;
  if (!isWithinCatch || next.gesture !== null || elapsedMilliseconds < moved.nextGrabAtMilliseconds) return { ...next, behaviour: moved };
  const grabMilliseconds = intendedGestureOf('grab').form.durationMilliseconds ?? 0;
  const nextGrabAtMilliseconds = elapsedMilliseconds + grabMilliseconds + CURSOR_PLAY.PAUSE_AFTER_GRAB_MILLISECONDS;
  const paused: ChaseBugState = { ...moved, nextGrabAtMilliseconds };
  return { ...withGesture(next, 'grab', elapsedMilliseconds, target), behaviour: paused };
}

/** The bug becomes a ticket, and Flint is happy. */
function ticketEntered(state: SpriteMindState, chase: ChaseBugState, elapsedMilliseconds: number): SpriteMindState {
  return withEmote({ ...state, behaviour: enteredStep(chase, 'ticket', elapsedMilliseconds) }, 'happy', elapsedMilliseconds);
}

/** The held bug on the page: where the hands closed, between them, as Flint stands and hovers now; the link and the ticket start there. */
function heldBetweenTheHands(state: SpriteMindState, chase: ChaseBugState, handsClosedAt: Point, elapsedMilliseconds: number, reducedMotion: boolean): ChaseBugState {
  const originY = originYOf(state, elapsedMilliseconds, reducedMotion);
  return {
    ...chase, handsClosedAt, bugX: state.motion.positionX + (state.motion.facing * handsClosedAt.x), bugY: originY + handsClosedAt.y,
  };
}

function heldOnThisFrame(state: SpriteMindState, chase: ChaseBugState, elapsedMilliseconds: number, reducedMotion: boolean): ChaseBugState {
  return chase.handsClosedAt === null ? chase : heldBetweenTheHands(state, chase, chase.handsClosedAt, elapsedMilliseconds, reducedMotion);
}

/** The grab that has the bug ends: Flint holds the bug itself with its closed hands, and stops. */
function caughtFrom(state: SpriteMindState, chase: ChaseBugState, elapsedMilliseconds: number, reducedMotion: boolean): SpriteMindState {
  const handsClosedAt = closedHandsAt(grabTargetOf(state, chase, originYOf(state, elapsedMilliseconds, reducedMotion)));
  const held = heldBetweenTheHands(state, enteredStep(chase, 'caught', elapsedMilliseconds), handsClosedAt, elapsedMilliseconds, reducedMotion);
  return withWalking({ ...withoutGesture(state), behaviour: held }, 0);
}

/** Each frame Flint's floor is the habitat's, less a lift that comes down; the held bug moves with Flint until it becomes a ticket. */
export function chaseBugAfterFrame(state: SpriteMindState, chase: ChaseBugState, perception: Perception, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds, deltaMilliseconds } = time;
  const { reducedMotion } = perception;
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  const { target } = perception;
  const elementIsGone = chase.elementAnchor !== null && target.kind !== 'on-the-page';
  if (box === null || elementIsGone) return chaseEnded(state, elapsedMilliseconds);
  const liftUnits = MovementUtil.loweredLiftOf(chase.liftUnits, deltaMilliseconds, reducedMotion);
  const floored: SpriteMindState = { ...state, motion: { ...state.motion, floorY: box.floorY - liftUnits } };
  const anchored: ChaseBugState = { ...chase, liftUnits, ...(target.kind === 'on-the-page' && chase.elementAnchor !== null ? { elementAnchor: anchorOf(target.box) } : {}), };
  const stepMilliseconds = elapsedMilliseconds - anchored.stepStartedAtMilliseconds;
  switch (anchored.step) {
    case 'chase': {
      if (floored.gesture?.intent === 'grab' && floored.gesture.verdict === true) return caughtFrom(floored, anchored, elapsedMilliseconds, reducedMotion);
      const ran = bugAfterFrame(floored, anchored, box, perception, time);
      return chasingAfterFrame(ran.mind, ran.chase, box, perception, time);
    }
    case 'caught': {
      const held = heldOnThisFrame(floored, anchored, elapsedMilliseconds, reducedMotion);
      if (stepMilliseconds < CHASE_BUG_TIMELINE.CAUGHT_MILLISECONDS) return { ...floored, behaviour: held };
      if (held.elementAnchor === null) return ticketEntered(floored, held, elapsedMilliseconds);
      return { ...floored, behaviour: enteredStep(held, 'link', elapsedMilliseconds) };
    }
    case 'link': {
      const held = heldOnThisFrame(floored, anchored, elapsedMilliseconds, reducedMotion);
      if (stepMilliseconds < CHASE_BUG_TIMELINE.LINK_MILLISECONDS) return { ...floored, behaviour: held };
      return ticketEntered(floored, held, elapsedMilliseconds);
    }
    case 'ticket':
      if (stepMilliseconds < CHASE_BUG_TIMELINE.TICKET_MILLISECONDS) return { ...floored, behaviour: anchored };
      return chaseEnded(floored, elapsedMilliseconds);
  }
}

function wiggleOf(chase: ChaseBugState, elapsedMilliseconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const isHeld = chase.step !== 'chase';
  return BugShapeUtil.wiggleDegreesAt(isHeld ? elapsedMilliseconds * CHASE_BUG_BUG.CAUGHT_WIGGLE_FACTOR : elapsedMilliseconds);
}

/** How far the held bug has shrunk away: from 0 until it becomes a ticket, to 1 once it is gone. */
function shrinkOf(chase: ChaseBugState, elapsedMilliseconds: number): number {
  if (chase.step !== 'ticket') return 0;
  return AnimationCurveUtil.clamp((elapsedMilliseconds - chase.stepStartedAtMilliseconds) / CHASE_BUG_TIMELINE.BUG_SHRINK_MILLISECONDS);
}

/**
 * The ticket fades in with its lowest corner where the bug's lowest point was, never below Flint's floor, rises by its height and fades out
 * over its time; under reduced motion it does not rise.
 */
function ticketShapesAt(chase: ChaseBugState, ticketMilliseconds: number, floorY: number, reducedMotion: boolean): readonly Shape[] {
  const fadeIn = AnimationCurveUtil.clamp(ticketMilliseconds / CHASE_BUG_TIMELINE.TICKET_FADE_IN_MILLISECONDS);
  const fadeOutStarts = CHASE_BUG_TIMELINE.TICKET_MILLISECONDS - CHASE_BUG_TIMELINE.TICKET_FADE_OUT_MILLISECONDS;
  const fadeOut = AnimationCurveUtil.clamp((ticketMilliseconds - fadeOutStarts) / CHASE_BUG_TIMELINE.TICKET_FADE_OUT_MILLISECONDS);
  const rise = reducedMotion ? 0 : CHASE_BUG_TIMELINE.TICKET_RISE_UNITS * AnimationCurveUtil.clamp(ticketMilliseconds / CHASE_BUG_TIMELINE.TICKET_MILLISECONDS);
  const lowestY = Math.min(chase.bugY + BUG_HEIGHT_ABOVE_FLOOR_UNITS, floorY);
  return ChasePageShapeUtil.ticketShapesOf({ x: chase.bugX, y: lowestY - MINI_SHEET_LOWEST_BELOW_CENTRE_UNITS - rise }, fadeIn * (1 - fadeOut));
}

/** The running bug in the chase, the link while the bug is held, and the ticket; the held bug itself is a prop of Flint. */
function pageShapesOf(chase: ChaseBugState, input: BehaviourPartInput): readonly Shape[] {
  const { elapsedMilliseconds, reducedMotion } = input;
  switch (chase.step) {
    case 'chase':
      return ChasePageShapeUtil.bugShapesOf({
        centre: { x: chase.bugX, y: chase.bugY }, scale: CHASE_BUG_BUG.SCALE, facing: chase.bugFacing, turnDegrees: wiggleOf(chase, elapsedMilliseconds, reducedMotion),
      });
    case 'caught':
      return [];
    case 'link':
      return chase.elementAnchor === null ? [] : [ChasePageShapeUtil.linkShapeOf({ x: chase.bugX, y: chase.bugY }, chase.elementAnchor)];
    case 'ticket':
      return ticketShapesAt(chase, elapsedMilliseconds - chase.stepStartedAtMilliseconds, input.state.motion.floorY, reducedMotion);
  }
}

/**
 * While Flint holds the bug, its hands are the closed hands of the grab that caught it, the bug is between them, wiggling twice as fast and
 * facing the way it faced, and the eyes are the chase's own.
 */
function heldPartOf(chase: ChaseBugState, handsClosedAt: Point, input: BehaviourPartInput): PosePart {
  const { facing } = input.state.motion;
  const grab = GRAB_GESTURE.targetPose({
    elapsedMilliseconds: GRAB_GESTURE_VALUES.CLOSE_MILLISECONDS,
    variant:             'normal',
    facing,
    sidewaysWidth:       1,
    target:              handsClosedAt,
    verdict:             true,
  });
  const heldBug: HeldBugState = {
    shown:       1,
    x:           handsClosedAt.x,
    y:           handsClosedAt.y,
    scale:       CHASE_BUG_BUG.SCALE * (1 - shrinkOf(chase, input.elapsedMilliseconds)),
    facing:      chase.bugFacing === facing ? 1 : -1,
    turnDegrees: wiggleOf(chase, input.elapsedMilliseconds, input.reducedMotion),
  };
  return { ...grab, eyes: { ...grab.eyes, height: CHASE_BUG_FLINT.CAUGHT_EYE_HEIGHT_UNITS }, props: { heldBug } };
}

function chasePartOf(chase: ChaseBugState, input: BehaviourPartInput): PosePart {
  if (chase.step === 'chase') return { eyes: { height: CHASE_BUG_FLINT.EYE_HEIGHT_UNITS, slantDegrees: CHASE_BUG_FLINT.EYE_SLANT_DEGREES } };
  const isHeld = chase.handsClosedAt !== null && shrinkOf(chase, input.elapsedMilliseconds) < 1;
  return isHeld && chase.handsClosedAt !== null ? heldPartOf(chase, chase.handsClosedAt, input) : { eyes: { height: CHASE_BUG_FLINT.CAUGHT_EYE_HEIGHT_UNITS } };
}

export function chaseBugPartOf(chase: ChaseBugState, input: BehaviourPartInput): BehaviourPart {
  const part = chasePartOf(chase, input);
  return {
    part,
    occlusion:      null,
    positionEasing: 'exact',
    blinkIsAllowed: false,
    page:           { shapes: pageShapesOf(chase, input), opacity: 1, fadeOutMilliseconds: CHASE_BUG_TIMELINE.FADE_OUT_MILLISECONDS },
  };
}

export const CHASE_BUG_BEHAVIOUR = behaviourDefinition({
  name:                   'chase-bug',
  intents:                ['chase-bug'],
  role:                   null,
  intentWhileRunning:     'ends-it',
  refusesItsOwnIntent:    true,
  intentKeepsTheQuiet:    false,
  asksDirector:           false,
  takesClicks:            false,
  takesSteering:          false,
  element:                'optional',
  aimsItsOwnGestures:     true,
  chosenWhenNothingIsNew: null,
  atRest:                 null,
  started:                chaseBugStarted,
  standingPlaceOf:        () => null,
  afterFrame:             chaseBugAfterFrame,
  partOf:                 chaseBugPartOf,
});
