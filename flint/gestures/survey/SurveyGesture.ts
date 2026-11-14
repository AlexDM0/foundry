/**
 * Implements `06-more-animations.md`, "Survey": Flint measures a blueprint along its top and down its side, thinks, sets three posts with
 * a lamp on each, and the lamps pass. The measure along the top goes from left to right on the screen whatever the facing, and so do the
 * posts and the lamps, since a pipeline reads in that order (`02-animations.md`, "Reading and writing direction").
 */
import type { Facing } from '../../SpriteGeometry.ts';
import type {
  EmoteMarkPose,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }             from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                        from '../../constants/HandShape.ts';
import { LAMP_SHAPE }                        from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }                from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureMarkUtil }                   from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import type { SurveyPostState, SurveyState } from './SurveyBlueprintProp.ts';
import { postBaseOf }                        from './SurveyBlueprintProp.ts';
import {
  SURVEY_EYES,
  SURVEY_HAND,
  SURVEY_POSTS,
  SURVEY_TIMELINE,
} from './constants/SurveyValues.ts';

const { progressBetween } = GestureTimelineUtil;

/**
 * The post the hand sets in each of its turns: left to right on the screen, so facing left the far post in Flint's own terms comes first.
 * The mapping is its own inverse: it also gives the turn of a post.
 */
function postIndexOfTurn(turn: number, facing: Facing): number {
  return facing === 1 ? turn : SURVEY_POSTS.X_UNITS.length - 1 - turn;
}

function postTurnStartOf(turn: number): number {
  return SURVEY_TIMELINE.POSTS_START_MILLISECONDS + (turn * SURVEY_TIMELINE.POST_MILLISECONDS);
}

function postsAt(timeInCycle: number, sceneOpacity: number, facing: Facing): readonly SurveyPostState[] {
  const pressMilliseconds = SURVEY_TIMELINE.POST_MILLISECONDS / 2;
  return SURVEY_POSTS.X_UNITS.map((_postX, postIndex): SurveyPostState => {
    const turn = postIndexOfTurn(postIndex, facing);
    const growth = progressBetween(timeInCycle, postTurnStartOf(turn), postTurnStartOf(turn) + pressMilliseconds);
    const passesAt = SURVEY_TIMELINE.LAMPS_PASS_MILLISECONDS + (turn * SURVEY_TIMELINE.LAMP_INTERVAL_MILLISECONDS);
    return {
      growth,
      lampOpacity: growth >= 1 ? sceneOpacity : 0,
      lamp:        timeInCycle >= passesAt ? 'passed' : 'off',
    };
  });
}

/** Along the top edge from its left end on the screen, then down the side, then it stays while Flint thinks; then a hexagon sets the posts. */
function handAt(timeInCycle: number, facing: Facing): HandPose | null {
  if (timeInCycle < SURVEY_TIMELINE.TOP_MEASURE_STARTS_MILLISECONDS || timeInCycle >= SURVEY_TIMELINE.LAMPS_PASS_MILLISECONDS) return null;
  const triangle = { cornerCount: HAND_SHAPE.POINTING_CORNER_COUNT, radius: SURVEY_HAND.MEASURE_RADIUS_UNITS, placement: 'eased' } as const;
  if (timeInCycle < SURVEY_TIMELINE.SIDE_MEASURE_STARTS_MILLISECONDS) {
    const leftEnd = { x: SURVEY_HAND.TOP_START_X_UNITS, y: SURVEY_HAND.TOP_START_Y_UNITS };
    const rightEnd = { x: SURVEY_HAND.TOP_END_X_UNITS, y: SURVEY_HAND.TOP_END_Y_UNITS };
    const along = progressBetween(timeInCycle, SURVEY_TIMELINE.TOP_MEASURE_STARTS_MILLISECONDS, SURVEY_TIMELINE.SIDE_MEASURE_STARTS_MILLISECONDS);
    const place = facing === 1 ? AnimationCurveUtil.interpolatedPoint(leftEnd, rightEnd, along) : AnimationCurveUtil.interpolatedPoint(rightEnd, leftEnd, along);
    return {
      ...triangle, centreX: place.x, centreY: place.y, turnDegrees: SURVEY_HAND.ALONG_TOP_TURN_DEGREES,
    };
  }
  if (timeInCycle < SURVEY_TIMELINE.POSTS_START_MILLISECONDS) {
    const down = progressBetween(timeInCycle, SURVEY_TIMELINE.SIDE_MEASURE_STARTS_MILLISECONDS, SURVEY_TIMELINE.THINKING_STARTS_MILLISECONDS);
    return {
      ...triangle,
      radius:      SURVEY_HAND.SIDE_RADIUS_UNITS,
      centreX:     SURVEY_HAND.SIDE_X_UNITS,
      centreY:     SURVEY_HAND.SIDE_START_Y_UNITS + ((SURVEY_HAND.SIDE_END_Y_UNITS - SURVEY_HAND.SIDE_START_Y_UNITS) * down),
      turnDegrees: SURVEY_HAND.DOWN_SIDE_TURN_DEGREES,
    };
  }
  const turn = Math.floor((timeInCycle - SURVEY_TIMELINE.POSTS_START_MILLISECONDS) / SURVEY_TIMELINE.POST_MILLISECONDS);
  const timeInTurn = timeInCycle - postTurnStartOf(turn);
  const halfTurn = SURVEY_TIMELINE.POST_MILLISECONDS / 2;
  const pressed = timeInTurn < halfTurn ? timeInTurn / halfTurn : 1 - ((timeInTurn - halfTurn) / halfTurn);
  const base = postBaseOf(SURVEY_POSTS.X_UNITS[postIndexOfTurn(turn, facing)] ?? 0);
  const lowestY = base.y - SURVEY_POSTS.HEIGHT_UNITS - (2 * LAMP_SHAPE.RADIUS_UNITS) - SURVEY_HAND.POST_RADIUS_UNITS;
  return {
    cornerCount: HAND_SHAPE.FASTENING_CORNER_COUNT,
    centreX:     base.x,
    centreY:     lowestY - (SURVEY_HAND.PRESS_UNITS * (1 - pressed)),
    radius:      SURVEY_HAND.POST_RADIUS_UNITS,
    turnDegrees: 0,
    placement:   'eased',
  };
}

/** The thinking dots until the posts start; the step is short, so they follow each other faster than in the Thinking emote. */
function thinkingDotsAt(timeInCycle: number): EmoteMarkPose | null {
  return GestureMarkUtil.thinkingDotsIn(timeInCycle, {
    startMilliseconds: SURVEY_TIMELINE.THINKING_STARTS_MILLISECONDS,
    endMilliseconds:   SURVEY_TIMELINE.POSTS_START_MILLISECONDS,
  });
}

function eyesAt(timeInCycle: number, hand: HandPose | null): Partial<EyesPose> {
  const followingLift = hand === null
    ? 0
    : AnimationCurveUtil.clamp((hand.centreY - SURVEY_EYES.LIFT_CENTRE_Y_UNITS) / SURVEY_EYES.LIFT_DIVISOR_UNITS, SURVEY_EYES.LIFT_LOWEST_UNITS, SURVEY_EYES.LIFT_HIGHEST_UNITS);
  const isMeasuring = timeInCycle >= SURVEY_TIMELINE.TOP_MEASURE_STARTS_MILLISECONDS && timeInCycle < SURVEY_TIMELINE.THINKING_STARTS_MILLISECONDS;
  const isThinking = timeInCycle >= SURVEY_TIMELINE.THINKING_STARTS_MILLISECONDS && timeInCycle < SURVEY_TIMELINE.POSTS_START_MILLISECONDS;
  const isHappy = timeInCycle >= SURVEY_TIMELINE.LAMPS_PASS_MILLISECONDS && timeInCycle < SURVEY_TIMELINE.FADES_OUT_MILLISECONDS;
  return {
    shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
    height: isMeasuring ? SURVEY_EYES.MEASURE_HEIGHT_UNITS : SURVEY_EYES.HEIGHT_UNITS,
    lift:   isThinking ? SURVEY_EYES.THINKING_LIFT_UNITS : followingLift,
    ...(isHappy ? { happiness: 1 } : {}),
  };
}

function surveyPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, SURVEY_TIMELINE.CYCLE_MILLISECONDS);
  const sceneOpacity = Math.min(
    progressBetween(timeInCycle, 0, SURVEY_TIMELINE.FADE_IN_MILLISECONDS),
    1 - progressBetween(timeInCycle, SURVEY_TIMELINE.FADES_OUT_MILLISECONDS, SURVEY_TIMELINE.CYCLE_MILLISECONDS),
  );
  const survey: SurveyState = {
    shown:       1,
    sceneOpacity,
    topMeasure:  progressBetween(timeInCycle, SURVEY_TIMELINE.TOP_MEASURE_STARTS_MILLISECONDS, SURVEY_TIMELINE.SIDE_MEASURE_STARTS_MILLISECONDS),
    sideMeasure: progressBetween(timeInCycle, SURVEY_TIMELINE.SIDE_MEASURE_STARTS_MILLISECONDS, SURVEY_TIMELINE.THINKING_STARTS_MILLISECONDS),
    posts:       postsAt(timeInCycle, sceneOpacity, input.facing),
  };
  const hand = handAt(timeInCycle, input.facing);
  const thinkingDots = thinkingDotsAt(timeInCycle);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     eyesAt(timeInCycle, hand),
    nearHand: hand,
    farHand:  null,
    props:    { surveyBlueprint: survey },
    ...(thinkingDots === null ? {} : { emoteMark: thinkingDots }),
  };
}

export const SURVEY_GESTURE = gestureDefinition({
  name:                  'survey',
  intents:               { survey: singleFormOf(null, SURVEY_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            surveyPartOf,
});
