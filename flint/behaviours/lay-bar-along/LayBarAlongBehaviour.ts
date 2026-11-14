/**
 * Lay the bar along a row (`08-more-behaviours.md`, `lay-bar-along`): the host gives the element of a ticket's bar on its timeline, and
 * the bar stays the host's. Flint walks along its floor to below the bar's left end, hovers up to the bar's bottom edge at the body rate,
 * and walks to its right end with the hand and eyes of the `lay-bar` gesture, while a fresh shimmer lies over the bar behind it. At the
 * right end it is happy, the shimmer fades out, and it hovers back down and rests. The bar is clamped to the habitat's box; a bar too
 * narrow to walk is only risen to, and a bar with no part inside the box is not laid. A drag, a new intent, or a habitat or element that is
 * gone ends it, and the shimmer fades out; the rest then brings Flint down. Under reduced motion Flint is placed at the bar's right end, on
 * its bottom edge, and is happy, with no shimmer.
 */
import { emoteDefinitionOf }       from '../../IntentMeaning.ts';
import type { PosePart }           from '../../SpritePose.ts';
import { MILLISECONDS_PER_SECOND } from '../../constants/Easing.ts';
import { WALK }                    from '../../constants/Motion.ts';
import type { Shape }              from '../../drawing/Shape.ts';
import { LAY_BAR_GESTURE }         from '../../gestures/lay-bar/LayBarGesture.ts';
import type { BehaviourPart }      from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }    from '../../mind/MindState.ts';
import {
  withEmote,
  withoutGesture,
  withWalking,
  withWokenUp
} from '../../mind/MindTransitions.ts';
import type { FrameTime, Perception, PlaceBox }    from '../../mind/Perception.ts';
import { MovementUtil }                            from '../../mind/utils/MovementUtil.ts';
import { PlaceUtil }                               from '../../mind/utils/PlaceUtil.ts';
import { AnimationCurveUtil }                      from '../../utils/AnimationCurveUtil.ts';
import type { BehaviourPartInput, BehaviourStart } from '../BehaviourDefinition.ts';
import { behaviourDefinition }                     from '../BehaviourDefinition.ts';
import { wanderAtRest }                            from '../wander/WanderBehaviour.ts';
import { ShimmerShapeUtil }                        from './ShimmerShapeUtil.ts';
import { LAY_BAR_ALONG, LAY_BAR_ALONG_SHIMMER }    from './constants/LayBarAlongValues.ts';

/** The steps: walk to below the bar, rise to it, lay it, and the end, in which Flint is happy and comes back down. */
export type LayStep = 'go' | 'rise' | 'lay' | 'end';

/** The host's bar on the last frame, clamped sideways to the habitat's box; overlay units. */
export interface LaidBar {
  readonly leftX:   number;
  readonly rightX:  number;
  readonly topY:    number;
  readonly bottomY: number;
}

export interface LayBarAlongState {
  readonly name:                      'lay-bar-along';
  readonly step:                      LayStep;
  readonly stepStartedAtMilliseconds: number;
  readonly bar:                       LaidBar;
  /** How long the lay takes, set when it starts from the bar's width then. */
  readonly layMilliseconds:           number;
  /** The shimmer as the lay left it at the right end, which fades out in the end; null when there was no lay. */
  readonly leftShimmer:               readonly Shape[] | null;
  /** How far above the habitat's floor Flint is while it goes to the bar or comes back down; it comes down at the body rate. */
  readonly liftUnits:                 number;
}

/**
 * The bar clamped to the habitat's box on all four sides, so its height is never negative; null when no part of it is inside the box,
 * since a bar Flint cannot reach is not laid.
 */
function laidBarOf(element: PlaceBox, habitat: PlaceBox): LaidBar | null {
  const isBesideTheBox = element.rightX <= habitat.leftX || element.leftX >= habitat.rightX;
  const isAboveOrBelowTheBox = element.floorY <= habitat.topY || element.topY >= habitat.floorY;
  if (isBesideTheBox || isAboveOrBelowTheBox) return null;
  const leftX = AnimationCurveUtil.clamp(element.leftX, habitat.leftX, habitat.rightX);
  const bottomY = AnimationCurveUtil.clamp(element.floorY, habitat.topY, habitat.floorY);
  return {
    leftX,
    rightX: AnimationCurveUtil.clamp(element.rightX, leftX, habitat.rightX),
    topY:   AnimationCurveUtil.clamp(element.topY, habitat.topY, bottomY),
    bottomY,
  };
}

function isNarrow(bar: LaidBar): boolean {
  return bar.rightX - bar.leftX < LAY_BAR_ALONG.NARROWEST_WALKED_UNITS;
}

/** The time of the lay: what the lay speed gives over the width, clamped. */
export function layMillisecondsOf(widthUnits: number): number {
  const atTheLaySpeed = (widthUnits / LAY_BAR_ALONG.LAY_SPEED_UNITS_PER_SECOND) * MILLISECONDS_PER_SECOND;
  return AnimationCurveUtil.clamp(atTheLaySpeed, LAY_BAR_ALONG.SHORTEST_LAY_MILLISECONDS, LAY_BAR_ALONG.LONGEST_LAY_MILLISECONDS);
}

/** Where Flint goes before it rises: below the left end, or below the middle of a bar too narrow to walk. */
function goalXOf(bar: LaidBar): number {
  return isNarrow(bar) ? (bar.leftX + bar.rightX) / 2 : bar.leftX;
}

function enteredStep(lay: LayBarAlongState, step: LayStep, elapsedMilliseconds: number): LayBarAlongState {
  return { ...lay, step, stepStartedAtMilliseconds: elapsedMilliseconds };
}

function layEnded(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return withWalking({ ...state, behaviour: wanderAtRest(elapsedMilliseconds) }, 0);
}

function shimmerOf(lay: LayBarAlongState, flintX: number, nowMilliseconds: number): readonly Shape[] {
  return ShimmerShapeUtil.shimmerShapesAt({
    leftX:                  lay.bar.leftX,
    flintX,
    topY:                   lay.bar.topY,
    bottomY:                lay.bar.bottomY,
    layStartedMilliseconds: lay.stepStartedAtMilliseconds,
    speedUnitsPerSecond:    (lay.bar.rightX - lay.bar.leftX) / (lay.layMilliseconds / MILLISECONDS_PER_SECOND),
    nowMilliseconds,
  });
}

/** The end: Flint is happy, and comes down from where it stands to the habitat's floor; under reduced motion it is placed on the bar's right end. */
function endEntered(state: SpriteMindState, lay: LayBarAlongState, box: PlaceBox, leftShimmer: readonly Shape[] | null, elapsedMilliseconds: number): SpriteMindState {
  const happy = withEmote(withWalking(withoutGesture(state), 0), 'happy', elapsedMilliseconds);
  const ended: LayBarAlongState = { ...enteredStep(lay, 'end', elapsedMilliseconds), leftShimmer, liftUnits: MovementUtil.liftAbove(state.motion.floorY, box.floorY) };
  return { ...happy, behaviour: ended };
}

export function layBarAlongStarted(state: SpriteMindState, start: BehaviourStart): SpriteMindState {
  const { perception, elapsedMilliseconds } = start;
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  const { target } = perception;
  if (box === null || target.kind !== 'on-the-page') return state;
  const bar = laidBarOf(target.box, box);
  if (bar === null) return state;
  const lay: LayBarAlongState = {
    name:                      'lay-bar-along',
    step:                      'go',
    stepStartedAtMilliseconds: elapsedMilliseconds,
    bar,
    layMilliseconds:           layMillisecondsOf(bar.rightX - bar.leftX),
    leftShimmer:               null,
    liftUnits:                 MovementUtil.liftAbove(state.motion.floorY, box.floorY),
  };
  const woken = { ...withoutGesture(withWokenUp(state, elapsedMilliseconds)), behaviour: lay, mayRestoreStoredHabitat: false };
  if (!perception.reducedMotion) return woken;
  const placed = {
    ...woken,
    motion: {
      ...woken.motion, positionX: bar.rightX, floorY: bar.bottomY, facing: 1 as const
    }
  };
  return endEntered(placed, lay, box, null, elapsedMilliseconds);
}

export function layBarAlongAfterFrame(state: SpriteMindState, own: LayBarAlongState, perception: Perception, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds, deltaMilliseconds } = time;
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  const { target } = perception;
  const bar = box === null || target.kind !== 'on-the-page' ? null : laidBarOf(target.box, box);
  if (box === null || bar === null) return layEnded(state, elapsedMilliseconds);
  const lay: LayBarAlongState = { ...own, bar };
  const { motion } = state;
  const stepMilliseconds = elapsedMilliseconds - lay.stepStartedAtMilliseconds;
  switch (lay.step) {
    case 'go': {
      const goalX = goalXOf(lay.bar);
      const positionX = MovementUtil.stepToward(motion.positionX, goalX, WALK.SPEED_UNITS_PER_SECOND, deltaMilliseconds);
      const liftUnits = MovementUtil.loweredLiftOf(lay.liftUnits, deltaMilliseconds, perception.reducedMotion);
      const lowered = { ...state, behaviour: { ...lay, liftUnits }, motion: { ...motion, floorY: box.floorY - liftUnits } };
      const walking = withWalking(lowered, MovementUtil.directionToward(motion.positionX, goalX));
      const moved = { ...walking, motion: { ...walking.motion, positionX } };
      return positionX === goalX ? withWalking({ ...moved, behaviour: enteredStep({ ...lay, liftUnits }, 'rise', elapsedMilliseconds) }, 0) : moved;
    }
    case 'rise': {
      const floorY = MovementUtil.floorTowards(motion.floorY, lay.bar.bottomY, deltaMilliseconds);
      const risen = { ...state, behaviour: lay, motion: { ...motion, positionX: goalXOf(lay.bar), floorY } };
      if (floorY !== lay.bar.bottomY) return risen;
      if (isNarrow(lay.bar)) return endEntered(risen, lay, box, null, elapsedMilliseconds);
      const laying: LayBarAlongState = { ...enteredStep(lay, 'lay', elapsedMilliseconds), layMilliseconds: layMillisecondsOf(lay.bar.rightX - lay.bar.leftX) };
      return { ...risen, behaviour: laying };
    }
    case 'lay': {
      const progress = AnimationCurveUtil.clamp(stepMilliseconds / lay.layMilliseconds);
      const positionX = lay.bar.leftX + ((lay.bar.rightX - lay.bar.leftX) * progress);
      const walking = withWalking({
        ...state,
        behaviour: lay,
        motion:    {
          ...motion, positionX, floorY: lay.bar.bottomY, facing: 1
        }
      }, progress < 1 ? 1 : 0);
      return progress < 1 ? walking : endEntered(walking, lay, box, shimmerOf(lay, positionX, elapsedMilliseconds), elapsedMilliseconds);
    }
    case 'end': {
      if (perception.reducedMotion) {
        if (stepMilliseconds < emoteDefinitionOf('happy').durationMilliseconds) return { ...state, behaviour: lay };
        return layEnded(state, elapsedMilliseconds);
      }
      const liftUnits = MovementUtil.loweredLiftOf(lay.liftUnits, deltaMilliseconds, false);
      const descending = { ...state, behaviour: { ...lay, liftUnits }, motion: { ...motion, floorY: box.floorY - liftUnits } };
      const shimmerHasFaded = lay.leftShimmer === null || stepMilliseconds >= LAY_BAR_ALONG_SHIMMER.FADE_OUT_MILLISECONDS;
      return liftUnits === 0 && shimmerHasFaded ? layEnded(descending, elapsedMilliseconds) : descending;
    }
  }
}

/** The `lay-bar` gesture at this moment of the lay, without its row line and bar: the host's bar and the shimmer replace them. */
function layingPartOf(lay: LayBarAlongState, input: BehaviourPartInput): PosePart {
  const gesture = LAY_BAR_GESTURE.targetPose({
    elapsedMilliseconds: input.elapsedMilliseconds - lay.stepStartedAtMilliseconds,
    variant:             'normal',
    facing:              input.state.motion.facing,
    sidewaysWidth:       1,
    target:              null,
    verdict:             null,
  });
  return {
    ...(gesture.body === undefined ? {} : { body: gesture.body }),
    ...(gesture.eyes === undefined ? {} : { eyes: gesture.eyes }),
    ...(gesture.nearHand === undefined ? {} : { nearHand: gesture.nearHand }),
    ...(gesture.farHand === undefined ? {} : { farHand: gesture.farHand }),
  };
}

function pageShapesOf(lay: LayBarAlongState, input: BehaviourPartInput): readonly Shape[] {
  if (lay.step === 'lay') return shimmerOf(lay, input.state.motion.positionX, input.elapsedMilliseconds);
  if (lay.step !== 'end' || lay.leftShimmer === null) return [];
  const fading = 1 - AnimationCurveUtil.clamp((input.elapsedMilliseconds - lay.stepStartedAtMilliseconds) / LAY_BAR_ALONG_SHIMMER.FADE_OUT_MILLISECONDS);
  return fading <= 0 ? [] : lay.leftShimmer.map((shape): Shape => ({ ...shape, opacity: (shape.opacity ?? 1) * fading }));
}

export function layBarAlongPartOf(lay: LayBarAlongState, input: BehaviourPartInput): BehaviourPart {
  return {
    part:           lay.step === 'lay' ? layingPartOf(lay, input) : null,
    occlusion:      null,
    positionEasing: 'exact',
    blinkIsAllowed: lay.step === 'go',
    page:           { shapes: pageShapesOf(lay, input), opacity: 1, fadeOutMilliseconds: LAY_BAR_ALONG_SHIMMER.FADE_OUT_MILLISECONDS },
  };
}

export const LAY_BAR_ALONG_BEHAVIOUR = behaviourDefinition({
  name:                   'lay-bar-along',
  intents:                ['lay-bar-along'],
  role:                   null,
  intentWhileRunning:     'ends-it',
  refusesItsOwnIntent:    false,
  intentKeepsTheQuiet:    false,
  asksDirector:           false,
  takesClicks:            false,
  takesSteering:          false,
  element:                'required',
  aimsItsOwnGestures:     false,
  chosenWhenNothingIsNew: null,
  atRest:                 null,
  started:                layBarAlongStarted,
  standingPlaceOf:        () => null,
  afterFrame:             layBarAlongAfterFrame,
  partOf:                 layBarAlongPartOf,
});
