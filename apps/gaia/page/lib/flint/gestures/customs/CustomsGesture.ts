/**
 * Customs: Flint compares each claim of a report with what is in the crate. For each of three
 * claims one pentagon reaches into the crate, lifts the item, Flint looks at the list and ticks the claim, and the hand puts the item back.
 * The third claim is found in one cycle and not found in the next: then the hand comes up empty and searches, and the claim gets a cross.
 */
import type { EyesPose, HandPose, PosePart } from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }             from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                        from '../../constants/HandShape.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import type { ClaimVerdict }                 from './CustomsListProp.ts';
import {
  CUSTOMS_BODY,
  CUSTOMS_CLAIM_TIMELINE,
  CUSTOMS_EYES,
  CUSTOMS_HAND,
  CUSTOMS_LIST_SHAPE,
  CUSTOMS_TIMELINE,
} from './constants/CustomsValues.ts';

const { progressBetween } = GestureTimelineUtil;

const CLAIM_COUNT = CUSTOMS_LIST_SHAPE.CLAIM_Y_UNITS.length;
const LAST_CLAIM_ENDS_MILLISECONDS = CUSTOMS_TIMELINE.FIRST_CLAIM_STARTS_MILLISECONDS
  + ((CLAIM_COUNT - 1) * CUSTOMS_TIMELINE.CLAIM_INTERVAL_MILLISECONDS) + CUSTOMS_CLAIM_TIMELINE.ENDS_MILLISECONDS;

/** The claim a time of the cycle falls in, and the time since that claim started; null before the first claim and after the last. */
interface ClaimMoment {
  readonly index:       number;
  readonly timeInClaim: number;
}

function claimMomentOf(timeInCycle: number): ClaimMoment | null {
  if (timeInCycle < CUSTOMS_TIMELINE.FIRST_CLAIM_STARTS_MILLISECONDS || timeInCycle >= LAST_CLAIM_ENDS_MILLISECONDS) return null;
  const sinceFirstClaim = timeInCycle - CUSTOMS_TIMELINE.FIRST_CLAIM_STARTS_MILLISECONDS;
  const index = Math.min(CLAIM_COUNT - 1, Math.floor(sinceFirstClaim / CUSTOMS_TIMELINE.CLAIM_INTERVAL_MILLISECONDS));
  return { index, timeInClaim: sinceFirstClaim - (index * CUSTOMS_TIMELINE.CLAIM_INTERVAL_MILLISECONDS) };
}

/** The last claim is found in every other cycle, starting with the first. */
function lastClaimIsFoundIn(elapsedMilliseconds: number): boolean {
  return Math.floor(elapsedMilliseconds / CUSTOMS_TIMELINE.CYCLE_MILLISECONDS) % 2 === 0;
}

/** The height of the hand in a claim: down in the crate, lifted while Flint looks, and back down; null while it only reaches in. */
function liftedHandYOf(timeInClaim: number): number | null {
  if (timeInClaim < CUSTOMS_CLAIM_TIMELINE.REACHED_MILLISECONDS || timeInClaim >= CUSTOMS_CLAIM_TIMELINE.ENDS_MILLISECONDS) return null;
  const lifted = progressBetween(timeInClaim, CUSTOMS_CLAIM_TIMELINE.REACHED_MILLISECONDS, CUSTOMS_CLAIM_TIMELINE.LIFTED_MILLISECONDS);
  const putBack = progressBetween(timeInClaim, CUSTOMS_CLAIM_TIMELINE.PUT_BACK_STARTS_MILLISECONDS, CUSTOMS_CLAIM_TIMELINE.ENDS_MILLISECONDS);
  const height = CUSTOMS_HAND.CRATE_Y_UNITS - CUSTOMS_HAND.LIFTED_Y_UNITS;
  return CUSTOMS_HAND.CRATE_Y_UNITS - (height * (lifted - putBack));
}

/** The hand reaches into the crate at the hand rate; from there its path is set exactly, so the item it holds moves with it. */
function handOf(claim: ClaimMoment, isFound: boolean): HandPose {
  const liftedY = liftedHandYOf(claim.timeInClaim);
  const search = progressBetween(claim.timeInClaim, CUSTOMS_CLAIM_TIMELINE.REACHED_MILLISECONDS, CUSTOMS_CLAIM_TIMELINE.LIFTED_MILLISECONDS);
  const isSearching = !isFound && search > 0 && search < 1;
  return {
    cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
    centreX:     CUSTOMS_HAND.CRATE_X_UNITS,
    centreY:     liftedY ?? CUSTOMS_HAND.CRATE_Y_UNITS,
    radius:      CUSTOMS_HAND.RADIUS_UNITS,
    turnDegrees: isSearching ? CUSTOMS_HAND.SEARCH_TURN_DEGREES * Math.sin(CUSTOMS_HAND.SEARCH_HALF_TURNS * Math.PI * search) : 0,
    placement:   liftedY === null ? 'eased' : 'exact-position',
  };
}

function verdictsAt(timeInCycle: number, isLastClaimFound: boolean): ClaimVerdict[] {
  return CUSTOMS_LIST_SHAPE.CLAIM_Y_UNITS.map((_claimY, i) => {
    const verdictMoment = CUSTOMS_TIMELINE.FIRST_CLAIM_STARTS_MILLISECONDS + (i * CUSTOMS_TIMELINE.CLAIM_INTERVAL_MILLISECONDS) + CUSTOMS_CLAIM_TIMELINE.VERDICT_MILLISECONDS;
    if (timeInCycle < verdictMoment) return 'unchecked';
    return i === CLAIM_COUNT - 1 && !isLastClaimFound ? 'not-found' : 'found';
  });
}

function eyesOf(timeInCycle: number, claim: ClaimMoment | null, isLastClaimFound: boolean): Partial<EyesPose> {
  const workingEyes = { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: CUSTOMS_EYES.WORKING_HEIGHT_UNITS };
  const isVerdict = timeInCycle >= CUSTOMS_TIMELINE.VERDICT_STARTS_MILLISECONDS && timeInCycle < CUSTOMS_TIMELINE.FADE_OUT_STARTS_MILLISECONDS;
  if (isVerdict) return isLastClaimFound ? { ...workingEyes, happiness: 1 } : { ...workingEyes, height: CUSTOMS_EYES.REFUSED_HEIGHT_UNITS };
  if (claim === null) return workingEyes;
  const isLookingAtList = claim.timeInClaim >= CUSTOMS_CLAIM_TIMELINE.LIFTED_MILLISECONDS && claim.timeInClaim < CUSTOMS_CLAIM_TIMELINE.PUT_BACK_STARTS_MILLISECONDS;
  const lift = isLookingAtList ? CUSTOMS_EYES.LIST_LIFT_UNITS : CUSTOMS_EYES.CRATE_LIFT_UNITS;
  const hasComeUpEmpty = !isLastClaimFound && claim.index === CLAIM_COUNT - 1 && claim.timeInClaim >= CUSTOMS_CLAIM_TIMELINE.REACHED_MILLISECONDS;
  return hasComeUpEmpty
    ? {
      ...workingEyes, lift, height: CUSTOMS_EYES.NOT_FOUND_HEIGHT_UNITS, slantDegrees: CUSTOMS_EYES.NOT_FOUND_SLANT_DEGREES,
    }
    : { ...workingEyes, lift };
}

function customsPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, CUSTOMS_TIMELINE.CYCLE_MILLISECONDS);
  const isLastClaimFound = lastClaimIsFoundIn(input.elapsedMilliseconds);
  const claim = claimMomentOf(timeInCycle);
  const isFound = claim !== null && (claim.index < CLAIM_COUNT - 1 || isLastClaimFound);
  const hand = claim === null ? null : handOf(claim, isFound);
  const isHoldingItem = hand !== null && isFound && liftedHandYOf(claim?.timeInClaim ?? 0) !== null;
  const isRefused = !isLastClaimFound && timeInCycle >= CUSTOMS_TIMELINE.VERDICT_STARTS_MILLISECONDS && timeInCycle < CUSTOMS_TIMELINE.FADE_OUT_STARTS_MILLISECONDS;
  const cycleOpacity = Math.min(
    progressBetween(timeInCycle, 0, CUSTOMS_TIMELINE.FADE_IN_MILLISECONDS),
    1 - progressBetween(timeInCycle, CUSTOMS_TIMELINE.FADE_OUT_STARTS_MILLISECONDS, CUSTOMS_TIMELINE.CYCLE_MILLISECONDS),
  );
  return {
    body:     { leanDegrees: isRefused ? CUSTOMS_BODY.REFUSED_LEAN_DEGREES : BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     eyesOf(timeInCycle, claim, isLastClaimFound),
    nearHand: hand,
    farHand:  null,
    props:    {
      customsList:  { shown: 1, cycleOpacity, verdicts: verdictsAt(timeInCycle, isLastClaimFound) },
      customsCrate: {
        shown:       1,
        cycleOpacity,
        itemCentreX: hand?.centreX ?? CUSTOMS_HAND.CRATE_X_UNITS,
        itemCentreY: hand?.centreY ?? CUSTOMS_HAND.CRATE_Y_UNITS,
        itemOpacity: isHoldingItem ? 1 : 0,
      },
    },
  };
}

export const CUSTOMS_GESTURE = gestureDefinition({
  name:                  'customs',
  intents:               { customs: singleFormOf(null, CUSTOMS_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            customsPartOf,
});
