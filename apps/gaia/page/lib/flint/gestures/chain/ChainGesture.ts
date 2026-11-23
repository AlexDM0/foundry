/**
 * Chain: a hexagon adds three links from ticket A to ticket B, each with the spring of an emote mark;
 * then B pulls at the chain two times while A stays, and Flint looks at A, the ticket that waits.
 */
import type { EyesPose, HandPose, PosePart } from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }             from '../../constants/BodyShape.ts';
import { SPRING }                            from '../../constants/Motion.ts';
import { AnimationCurveUtil }                from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import { chainLinkCentreOf }                 from './ChainedSheetsProp.ts';
import {
  CHAIN_EYES,
  CHAIN_HAND,
  CHAIN_LINKS,
  CHAIN_SHEETS,
  CHAIN_TIMELINE
} from './constants/ChainValues.ts';

const AT_REST = Object.freeze({ x: 0, y: 0 });

function linkAddedMillisecondsOf(linkIndex: number): number {
  return CHAIN_TIMELINE.FIRST_LINK_MILLISECONDS + (linkIndex * CHAIN_TIMELINE.LINK_INTERVAL_MILLISECONDS);
}

/** The hexagon is at the link it adds, until the next one, and turns once more for each link. */
function linkingHandAt(timeInCycle: number): HandPose | null {
  if (timeInCycle < CHAIN_TIMELINE.FIRST_LINK_MILLISECONDS || timeInCycle >= CHAIN_TIMELINE.HAND_LEAVES_MILLISECONDS) return null;
  const linkIndex = Math.min(
    CHAIN_LINKS.COUNT - 1,
    Math.floor((timeInCycle - CHAIN_TIMELINE.FIRST_LINK_MILLISECONDS) / CHAIN_TIMELINE.LINK_INTERVAL_MILLISECONDS),
  );
  const link = chainLinkCentreOf(linkIndex, AT_REST);
  return {
    cornerCount: CHAIN_HAND.CORNER_COUNT,
    centreX:     link.x + CHAIN_HAND.OFFSET_X_UNITS,
    centreY:     link.y + CHAIN_HAND.OFFSET_Y_UNITS,
    radius:      CHAIN_HAND.RADIUS_UNITS,
    turnDegrees: CHAIN_HAND.TURN_PER_LINK_DEGREES * (linkIndex + 1),
    placement:   'eased',
  };
}

/** How far sheet B is out on a pull, from 0 at rest to 1 at the middle of the pull. */
function pullAt(timeInCycle: number): number {
  return CHAIN_TIMELINE.PULL_MOMENTS_MILLISECONDS.reduce((pull, momentMilliseconds) => {
    const progress = GestureTimelineUtil.progressBetween(timeInCycle, momentMilliseconds, momentMilliseconds + CHAIN_TIMELINE.PULL_MILLISECONDS);
    return Math.max(pull, Math.sin(Math.PI * progress));
  }, 0);
}

function eyesAt(timeInCycle: number): Partial<EyesPose> {
  if (timeInCycle < CHAIN_TIMELINE.PULLS_START_MILLISECONDS) return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: CHAIN_HAND.WORKING_EYE_HEIGHT_UNITS };
  if (timeInCycle < CHAIN_TIMELINE.LOOK_AT_A_MILLISECONDS) return { shift: CHAIN_EYES.PULL_SHIFT_UNITS, lift: CHAIN_EYES.PULL_LIFT_UNITS };
  if (timeInCycle < CHAIN_TIMELINE.LEAVES_MILLISECONDS) return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, lift: CHAIN_EYES.LOOK_AT_A_LIFT_UNITS };
  return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS };
}

function chainPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, CHAIN_TIMELINE.CYCLE_MILLISECONDS);
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, CHAIN_TIMELINE.LEAVES_MILLISECONDS, CHAIN_TIMELINE.CYCLE_MILLISECONDS);
  const pull = pullAt(timeInCycle);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     eyesAt(timeInCycle),
    nearHand: linkingHandAt(timeInCycle),
    farHand:  null,
    props:    {
      chainedSheets: {
        shown:        1,
        cycleOpacity: Math.min(GestureTimelineUtil.progressBetween(timeInCycle, 0, CHAIN_TIMELINE.FADE_IN_MILLISECONDS), 1 - leaving),
        linkScales:   Array.from({ length: CHAIN_LINKS.COUNT }, (_unused, i) => AnimationCurveUtil.springScaleAt(
          (timeInCycle - linkAddedMillisecondsOf(i)) / SPRING.DURATION_MILLISECONDS,
        )),
        sheetBOffsetX: CHAIN_SHEETS.B_PULL_X_UNITS * pull,
        sheetBOffsetY: CHAIN_SHEETS.B_PULL_Y_UNITS * pull,
      },
    },
  };
}

export const CHAIN_GESTURE = gestureDefinition({
  name:                  'chain',
  intents:               { chain: singleFormOf(null, CHAIN_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            chainPartOf,
});
