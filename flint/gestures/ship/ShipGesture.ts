/**
 * Implements `06-more-animations.md`, "Ship": two pentagons lift a landed block onto a shelf, the block and the shelf give on landing, a
 * tick shows, and Flint salutes with a square, standing tall, then is happy. One action. The hands lift with the block, so they are placed
 * exactly; the renderer mirrors the tick back, so the part is the same either facing.
 */
import type { EyesPose, HandPose, PosePart } from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }             from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                        from '../../constants/HandShape.ts';
import { AnimationCurveUtil }                from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import type { ShipState }                    from './ShipShelfProp.ts';
import {
  SHIP_BODY,
  SHIP_EYES,
  SHIP_HANDS,
  SHIP_SHAPE,
  SHIP_TIMELINE,
} from './constants/ShipValues.ts';

const { progressBetween } = GestureTimelineUtil;

function shipStateAt(elapsedMilliseconds: number): ShipState {
  const lift = progressBetween(elapsedMilliseconds, SHIP_TIMELINE.LIFT_STARTS_MILLISECONDS, SHIP_TIMELINE.LANDED_MILLISECONDS);
  const lifted = lift * lift;
  const sinceLanding = elapsedMilliseconds - SHIP_TIMELINE.LANDED_MILLISECONDS;
  const isSquashed = sinceLanding >= 0 && sinceLanding < SHIP_TIMELINE.SQUASH_MILLISECONDS;
  const isShelfDown = sinceLanding >= 0 && sinceLanding < SHIP_TIMELINE.SHELF_DROP_MILLISECONDS;
  const sceneOpacity = Math.min(
    progressBetween(elapsedMilliseconds, 0, SHIP_TIMELINE.FADE_IN_MILLISECONDS),
    1 - progressBetween(elapsedMilliseconds, SHIP_TIMELINE.LEAVES_MILLISECONDS, SHIP_TIMELINE.DURATION_MILLISECONDS),
  );
  return {
    shown:             1,
    sceneOpacity,
    blockX:            SHIP_SHAPE.START_X_UNITS + ((SHIP_SHAPE.SHELVED_X_UNITS - SHIP_SHAPE.START_X_UNITS) * lifted),
    blockY:            SHIP_SHAPE.START_Y_UNITS + ((SHIP_SHAPE.SHELVED_Y_UNITS - SHIP_SHAPE.START_Y_UNITS) * lifted),
    blockHeightFactor: isSquashed ? SHIP_SHAPE.SQUASH_HEIGHT_FACTOR : 1,
    shelfDrop:         isShelfDown ? SHIP_SHAPE.SHELF_DROP_UNITS : 0,
    tickOpacity:       elapsedMilliseconds >= SHIP_TIMELINE.TICK_SHOWS_MILLISECONDS ? sceneOpacity : 0,
  };
}

function liftingHandOf(ship: ShipState, offsetX: number, radius: number): HandPose {
  return {
    cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
    centreX:     ship.blockX + offsetX,
    centreY:     ship.blockY + SHIP_HANDS.OFFSET_Y_UNITS,
    radius,
    turnDegrees: 0,
    placement:   'exact-position',
  };
}

const SALUTE: HandPose = Object.freeze({
  cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
  centreX:     SHIP_HANDS.SALUTE_X_UNITS,
  centreY:     SHIP_HANDS.SALUTE_Y_UNITS,
  radius:      SHIP_HANDS.SALUTE_RADIUS_UNITS,
  turnDegrees: SHIP_HANDS.SALUTE_TURN_DEGREES,
  placement:   'eased',
});

/** Between the landing and the salute the square stays by the block's near end, where the near pentagon let go, clear of the body. */
function squareByTheBlockOf(ship: ShipState): HandPose {
  return {
    ...SALUTE,
    centreX:     ship.blockX + SHIP_HANDS.NEAR_OFFSET_X_UNITS,
    centreY:     ship.blockY + SHIP_HANDS.OFFSET_Y_UNITS,
    turnDegrees: 0,
  };
}

function eyesAt(elapsedMilliseconds: number, ship: ShipState): Partial<EyesPose> {
  const happiness = elapsedMilliseconds >= SHIP_TIMELINE.HAPPY_EYES_FROM_MILLISECONDS ? { happiness: 1 } : {};
  if (elapsedMilliseconds >= SHIP_TIMELINE.SALUTE_STARTS_MILLISECONDS) return { height: SHIP_EYES.SALUTE_HEIGHT_UNITS, shift: SHIP_EYES.SALUTE_SHIFT_UNITS, ...happiness };
  const blockMiddleY = ship.blockY + (SHIP_HANDS.OFFSET_Y_UNITS / 2);
  return {
    height: SHIP_EYES.LIFT_HEIGHT_UNITS,
    shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
    lift:   AnimationCurveUtil.clamp((blockMiddleY - SHIP_EYES.LIFT_CENTRE_Y_UNITS) / SHIP_EYES.LIFT_DIVISOR_UNITS, SHIP_EYES.LIFT_LOWEST_UNITS, SHIP_EYES.LIFT_HIGHEST_UNITS),
  };
}

function nearHandAt(elapsedMilliseconds: number, ship: ShipState): HandPose | null {
  if (elapsedMilliseconds < SHIP_TIMELINE.LANDED_MILLISECONDS) return liftingHandOf(ship, SHIP_HANDS.NEAR_OFFSET_X_UNITS, SHIP_HANDS.NEAR_RADIUS_UNITS);
  if (elapsedMilliseconds < SHIP_TIMELINE.SALUTE_STARTS_MILLISECONDS) return squareByTheBlockOf(ship);
  return elapsedMilliseconds < SHIP_TIMELINE.LEAVES_MILLISECONDS ? SALUTE : null;
}

function shipPartOf(input: GestureInput): PosePart {
  const elapsed = input.elapsedMilliseconds;
  const ship = shipStateAt(elapsed);
  const isLifting = elapsed < SHIP_TIMELINE.LANDED_MILLISECONDS;
  const isSaluting = elapsed >= SHIP_TIMELINE.SALUTE_STARTS_MILLISECONDS && elapsed < SHIP_TIMELINE.LEAVES_MILLISECONDS;
  return {
    body: isSaluting
      ? { leanDegrees: SHIP_BODY.SALUTE_LEAN_DEGREES, heightFactor: SHIP_BODY.SALUTE_HEIGHT_FACTOR }
      : { leanDegrees: elapsed < SHIP_TIMELINE.SALUTE_STARTS_MILLISECONDS ? BODY_SHAPE.WORKING_LEAN_DEGREES : 0 },
    eyes:     eyesAt(elapsed, ship),
    nearHand: nearHandAt(elapsed, ship),
    farHand:  isLifting ? liftingHandOf(ship, SHIP_HANDS.FAR_OFFSET_X_UNITS, SHIP_HANDS.FAR_RADIUS_UNITS) : null,
    props:    { shipShelf: ship },
  };
}

export const SHIP_GESTURE = gestureDefinition({
  name:                  'ship',
  intents:               { ship: singleFormOf(SHIP_TIMELINE.DURATION_MILLISECONDS, SHIP_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            shipPartOf,
});
