/**
 * Visit, with `02-animations.md`, "Pop-in around a corner": Flint walks to 28 units outside an edge of the component, goes behind it while
 * it turns sideways, waits, peeks, ducks, peeks again, waves, and moves in while it turns to face the user; then it lives there. The
 * component is drawn in front of Flint for the whole sequence. A Flint on another floor line starts hidden behind the edge, at the wait.
 * Under reduced motion it arrives at once.
 */
import type { Facing }                                 from '../SpritePose.ts';
import { POP_IN }                                      from '../constants/Behaviours.ts';
import { BODY_SHAPE }                                  from '../constants/BodyShape.ts';
import { WALK }                                        from '../constants/Motion.ts';
import type { BehaviourPart }                          from '../mind/BehaviourPart.ts';
import type { PopInStep, SpriteMindState, VisitState } from '../mind/MindState.ts';
import {
  wanderAtRest,
  withArrival,
  withGesture,
  withoutGesture,
  withWokenUp
} from '../mind/MindTransitions.ts';
import type { FrameTime, PerceivedHabitat, Perception } from '../mind/Perception.ts';
import { MovementUtil }                                 from '../mind/utils/MovementUtil.ts';
import { PlaceUtil }                                    from '../mind/utils/PlaceUtil.ts';
import { AnimationCurveUtil }                           from '../utils/AnimationCurveUtil.ts';
import { GROUNDED, JumpMotionUtil }                     from '../utils/JumpMotionUtil.ts';

const HALF_BODY_WIDTH_UNITS = BODY_SHAPE.WIDTH_UNITS / 2;

/** How long each step that waits lasts; the steps that move end when Flint gets to its point. */
const STEP_MILLISECONDS: Readonly<Partial<Record<PopInStep, number>>> = Object.freeze({
  'wait':       POP_IN.WAIT_MILLISECONDS,
  'peek':       POP_IN.PEEK_MILLISECONDS,
  'duck':       POP_IN.DUCK_MILLISECONDS,
  'peek-again': POP_IN.PEEK_AGAIN_MILLISECONDS,
  'wave':       POP_IN.WAVE_MILLISECONDS,
});

const NEXT_STEP: Readonly<Record<PopInStep, PopInStep | null>> = Object.freeze({
  'go':         'go-behind',
  'go-behind':  'wait',
  'wait':       'peek',
  'peek':       'duck',
  'duck':       'peek-again',
  'peek-again': 'wave',
  'wave':       'move-in',
  'move-in':    null,
});

/** Where the body centre is held in the steps that do not walk; the position eases there at the peek rate. */
const HELD_OFFSET_UNITS: Readonly<Partial<Record<PopInStep, number>>> = Object.freeze({
  'peek':       POP_IN.PEEK_OFFSET_UNITS,
  'duck':       POP_IN.DUCK_OFFSET_UNITS,
  'peek-again': POP_IN.PEEK_OFFSET_UNITS,
});

const PEEKING_STEPS: readonly PopInStep[] = ['peek', 'duck', 'peek-again', 'wave'];

/** The width while Flint turns, 80% at the peek point and 100% at 28 units outside: `0.8 + 0.2 × clamp((x - 3.5) / 24.5)`. */
export function turningWidthAt(offsetUnits: number): number {
  const turned = AnimationCurveUtil.clamp((offsetUnits - POP_IN.PEEK_OFFSET_UNITS) / (POP_IN.BESIDE_OFFSET_UNITS - POP_IN.PEEK_OFFSET_UNITS));
  return BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR + ((1 - BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR) * turned);
}

function sidewaysWidthOf(visit: VisitState): number {
  if (visit.step === 'go') return 1;
  if (visit.step === 'go-behind' || visit.step === 'move-in') return turningWidthAt(visit.offsetUnits);
  return BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR;
}

function besideSpotFits(habitat: PerceivedHabitat, edgeSide: Facing, stageWidthUnits: number): boolean {
  const reach = POP_IN.BESIDE_OFFSET_UNITS + HALF_BODY_WIDTH_UNITS;
  return edgeSide === 1 ? habitat.box.rightX + reach <= stageWidthUnits : habitat.box.leftX - reach >= 0;
}

/** On the same floor line, the edge nearer to Flint; from elsewhere, the right edge when its spot outside fits on the page. */
function edgeSideFor(state: SpriteMindState, habitat: PerceivedHabitat, perception: Perception, isOnItsFloorLine: boolean): Facing {
  if (isOnItsFloorLine) {
    const toRight = Math.abs(state.motion.positionX - (habitat.box.rightX + POP_IN.BESIDE_OFFSET_UNITS));
    const toLeft = Math.abs(state.motion.positionX - (habitat.box.leftX - POP_IN.BESIDE_OFFSET_UNITS));
    return toRight <= toLeft ? 1 : -1;
  }
  if (besideSpotFits(habitat, 1, perception.stageWidthUnits)) return 1;
  return besideSpotFits(habitat, -1, perception.stageWidthUnits) ? -1 : 1;
}

export function visitStarted(state: SpriteMindState, habitat: PerceivedHabitat, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  const woken = withoutGesture(withWokenUp(state, elapsedMilliseconds));
  const { box } = habitat;
  if (perception.reducedMotion) {
    const placed = {
      ...woken,
      motion: {
        ...woken.motion, positionX: PlaceUtil.clampedToFloor(woken.motion.positionX, box), floorY: box.floorY, walkDirection: 0 as const, jump: GROUNDED
      }
    };
    return withArrival(placed, habitat.id, elapsedMilliseconds, false);
  }
  const isOnItsFloorLine = state.isPlaced && !JumpMotionUtil.isAirborne(state.motion.jump) && Math.abs(state.motion.floorY - box.floorY) <= POP_IN.SAME_FLOOR_TOLERANCE_UNITS;
  const edgeSide = edgeSideFor(state, habitat, perception, isOnItsFloorLine);
  const edgeX = PlaceUtil.edgeXOf(box, edgeSide);
  const offsetUnits = isOnItsFloorLine ? (state.motion.positionX - edgeX) * edgeSide : POP_IN.BEHIND_OFFSET_UNITS;
  const step: PopInStep = isOnItsFloorLine ? 'go' : 'wait';
  return {
    ...woken,
    behaviour: {
      name: 'visit', habitatId: habitat.id, edgeSide, edgeX, step, stepStartedAtMilliseconds: elapsedMilliseconds, offsetUnits,
    },
    motion: {
      ...woken.motion,
      positionX:     edgeX + (edgeSide * offsetUnits),
      floorY:        box.floorY,
      facing:        isOnItsFloorLine ? woken.motion.facing : (-edgeSide as Facing),
      walkDirection: 0,
      jump:          GROUNDED,
    },
    mayRestoreStoredHabitat: false,
  };
}

function enteredStep(state: SpriteMindState, visit: VisitState, step: PopInStep, elapsedMilliseconds: number): SpriteMindState {
  const entered: VisitState = {
    ...visit, step, stepStartedAtMilliseconds: elapsedMilliseconds, offsetUnits: HELD_OFFSET_UNITS[step] ?? visit.offsetUnits
  };
  const facing: Facing = step === 'go-behind' ? (-visit.edgeSide as Facing) : step === 'peek' ? visit.edgeSide : state.motion.facing;
  const moved = { ...state, behaviour: entered, motion: { ...state.motion, facing } };
  if (step === 'wave') return withGesture(moved, 'wave', 'normal', elapsedMilliseconds);
  if (step === 'move-in') return withoutGesture(moved);
  return moved;
}

/** The offset after this frame's walk in a step that walks, and whether the walk got to its point. */
function walkedOffsetOf(visit: VisitState, deltaMilliseconds: number): { readonly offsetUnits: number; readonly isThere: boolean } {
  const walk = {
    'go':        { targetUnits: POP_IN.BESIDE_OFFSET_UNITS, speed: WALK.SPEED_UNITS_PER_SECOND },
    'go-behind': { targetUnits: POP_IN.BEHIND_OFFSET_UNITS, speed: POP_IN.BEHIND_WALK_SPEED_UNITS_PER_SECOND },
    'move-in':   { targetUnits: POP_IN.BESIDE_OFFSET_UNITS, speed: POP_IN.MOVE_IN_SPEED_UNITS_PER_SECOND },
  }[visit.step as 'go' | 'go-behind' | 'move-in'];
  const offsetUnits = MovementUtil.stepToward(visit.offsetUnits, walk.targetUnits, walk.speed, deltaMilliseconds);
  return { offsetUnits, isThere: offsetUnits === walk.targetUnits };
}

export function visitAfterFrame(state: SpriteMindState, visit: VisitState, perception: Perception, time: FrameTime): SpriteMindState {
  const habitat = PlaceUtil.habitatById(perception, visit.habitatId);
  if (habitat === null || !habitat.isRoomy) return withoutGesture({ ...state, behaviour: wanderAtRest(time.elapsedMilliseconds) });
  const measured: VisitState = { ...visit, edgeX: PlaceUtil.edgeXOf(habitat.box, visit.edgeSide) };
  let next: SpriteMindState = { ...state, behaviour: measured };
  const stepMilliseconds = time.elapsedMilliseconds - measured.stepStartedAtMilliseconds;
  const stepLength = STEP_MILLISECONDS[measured.step];
  const nextStep = NEXT_STEP[measured.step];
  if (stepLength !== undefined && stepMilliseconds >= stepLength && nextStep !== null) next = enteredStep(next, measured, nextStep, time.elapsedMilliseconds);

  let current = next.behaviour as VisitState;
  if (current.step === 'go' || current.step === 'go-behind' || current.step === 'move-in') {
    const walked = walkedOffsetOf(current, time.deltaMilliseconds);
    const facing = current.step === 'go'
      ? MovementUtil.facingToward(current.offsetUnits * current.edgeSide, walked.offsetUnits * current.edgeSide, next.motion.facing)
      : next.motion.facing;
    current = { ...current, offsetUnits: walked.offsetUnits };
    next = { ...next, behaviour: current, motion: { ...next.motion, facing } };
    if (walked.isThere && current.step === 'move-in') {
      const arrivedAt = { ...next, motion: { ...next.motion, positionX: current.edgeX + (current.edgeSide * current.offsetUnits), floorY: habitat.box.floorY } };
      return withArrival(arrivedAt, habitat.id, time.elapsedMilliseconds, true);
    }
    if (walked.isThere) {
      const following = NEXT_STEP[current.step];
      if (following !== null) next = enteredStep(next, current, following, time.elapsedMilliseconds);
      current = next.behaviour as VisitState;
    }
  }
  return {
    ...next,
    motion: {
      ...next.motion, positionX: current.edgeX + (current.edgeSide * current.offsetUnits), floorY: habitat.box.floorY, walkDirection: 0,
    },
  };
}

export function visitPartOf(visit: VisitState): BehaviourPart {
  const isPeeking = visit.step === 'peek' || visit.step === 'peek-again';
  return {
    part: {
      body:        { leanDegrees: POP_IN.LEAN_DEGREES, sidewaysWidth: sidewaysWidthOf(visit) },
      eyes:        isPeeking ? { shift: POP_IN.EYE_SHIFT_UNITS, height: POP_IN.PEEK_EYE_HEIGHT_UNITS } : { shift: POP_IN.EYE_SHIFT_UNITS },
      exactFields: ['sideways-width'],
    },
    occlusion:      { edgeX: visit.edgeX, hiddenSide: -visit.edgeSide as Facing },
    positionEasing: PEEKING_STEPS.includes(visit.step) ? 'peek' : 'exact',
    blinkIsAllowed: false,
  };
}
