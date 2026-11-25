/**
 * Waiver: Flint writes its initials beside the cross of a reviewed sheet, the cross greys and gives
 * way to a grey tick, and Flint doubts it, with no happy eyes. The initials read from left to right on the screen whatever the facing, and
 * the pen stays right of their written end on the screen, as the pen of Make a ticket.
 */
import type { Facing, Point }              from '../../SpriteGeometry.ts';
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { PEN }                             from '../constants/PenMotion.ts';
import { WaiverInitialsUtil }              from './WaiverInitialsUtil.ts';
import {
  WAIVER_EXTENT,
  WAIVER_INITIALS,
  WAIVER_POSE,
  WAIVER_TIMELINE,
} from './constants/WaiverValues.ts';

/** The pen right of the written end on the screen: facing left, the initials are mirrored back about their middle. */
function penAt(writtenEnd: Point, facing: Facing): HandPose {
  const endX = facing === 1 ? writtenEnd.x : (2 * WaiverInitialsUtil.mirrorAxisX()) - writtenEnd.x;
  return {
    cornerCount: PEN.CORNER_COUNT,
    centreX:     endX + (PEN.OFFSET_X_UNITS * facing),
    centreY:     writtenEnd.y + PEN.OFFSET_Y_UNITS,
    radius:      PEN.RADIUS_UNITS,
    turnDegrees: PEN.TURN_DEGREES * facing,
    placement:   'eased',
  };
}

function bodyAndEyesAt(timeInCycle: number): Pick<PosePart, 'body' | 'eyes'> {
  if (timeInCycle < WAIVER_TIMELINE.TICK_SHOWN_MILLISECONDS) {
    return {
      body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
      eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: WAIVER_POSE.WRITING_HEIGHT_UNITS, lift: WAIVER_POSE.WRITING_LIFT_UNITS },
    };
  }
  if (timeInCycle < WAIVER_TIMELINE.DOUBT_ENDS_MILLISECONDS) {
    return {
      body: { leanDegrees: WAIVER_POSE.DOUBT_LEAN_DEGREES },
      eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, rightHeightOverride: WAIVER_POSE.DOUBT_RIGHT_EYE_HEIGHT_UNITS },
    };
  }
  return { body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES }, eyes: { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS } };
}

function waiverPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, WAIVER_TIMELINE.CYCLE_MILLISECONDS);
  const { progressBetween } = GestureTimelineUtil;
  const writtenShare = progressBetween(timeInCycle, WAIVER_TIMELINE.WRITING_STARTS_MILLISECONDS, WAIVER_TIMELINE.WRITING_ENDS_MILLISECONDS);
  const leaving = progressBetween(timeInCycle, WAIVER_TIMELINE.DOUBT_ENDS_MILLISECONDS, WAIVER_TIMELINE.CYCLE_MILLISECONDS);
  const writtenEnd = WaiverInitialsUtil.writtenPointsOf(writtenShare).at(-1) ?? { x: WAIVER_INITIALS.START_X_UNITS, y: WAIVER_INITIALS.START_Y_UNITS };
  return {
    ...bodyAndEyesAt(timeInCycle),
    nearHand: timeInCycle < WAIVER_TIMELINE.TICK_SHOWN_MILLISECONDS ? penAt(writtenEnd, input.facing) : null,
    farHand:  null,
    props:    {
      waiverSheet: {
        shown:        1,
        cycleOpacity: Math.min(progressBetween(timeInCycle, 0, WAIVER_TIMELINE.FADE_IN_MILLISECONDS), 1 - leaving),
        writtenShare,
        greyed:       progressBetween(timeInCycle, WAIVER_TIMELINE.WRITING_ENDS_MILLISECONDS, WAIVER_TIMELINE.GREYED_MILLISECONDS),
        waived:       progressBetween(timeInCycle, WAIVER_TIMELINE.GREYED_MILLISECONDS, WAIVER_TIMELINE.TICK_SHOWN_MILLISECONDS),
      },
    },
  };
}

export const WAIVER_GESTURE = gestureDefinition({
  name:                  'waiver',
  intents:               { waiver: singleFormOf(null, WAIVER_TIMELINE.STILL_MOMENT_MILLISECONDS, WAIVER_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            waiverPartOf,
});
