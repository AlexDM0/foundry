/**
 * Bank the fire: Flint lands and leans back, one square pats its top twice and cools it, the eyes
 * close to a slit, and then the fire stays banked: a dark body, a slow inner glow and one ember. It is not Sleep: the body does not breathe
 * and the eyes stay a little open. The ember is ember 2 of Sleep (`flint/sleep/Embers.ts`), timed to rise from the end of the entrance.
 */
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { EYE_SHAPE }                       from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { EMBER_RISE }                      from '../../constants/SleepMotion.ts';
import { embersOf }                        from '../../sleep/Embers.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { BankedEmberState }           from './BankedEmberProp.ts';
import {
  BANKED_EMBER,
  BANKED_GLOW,
  BANK_FIRE,
  BANK_FIRE_EXTENT,
  COOLING,
  PATS,
} from './constants/BankFireValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** The square over the top of Flint, down and back once in each pat, its place set exactly so each pat goes its full depth; gone after. */
function pattingHandAt(elapsedMilliseconds: number): HandPose | null {
  if (elapsedMilliseconds >= PATS.HAND_GOES_MILLISECONDS) return null;
  const pressed = PATS.STARTS_MILLISECONDS.reduce((depth, patStart) => {
    const pat = progressBetween(elapsedMilliseconds, patStart, patStart + PATS.PAT_MILLISECONDS);
    return pat > 0 && pat < 1 ? Math.sin(Math.PI * pat) : depth;
  }, 0);
  return {
    cornerCount: HAND_SHAPE.TYPING_CORNER_COUNT,
    centreX:     PATS.HAND_CENTRE_X_UNITS,
    centreY:     PATS.HAND_CENTRE_Y_UNITS + (PATS.DEPTH_UNITS * pressed),
    radius:      PATS.HAND_RADIUS_UNITS,
    turnDegrees: PATS.HAND_TURN_DEGREES,
    placement:   elapsedMilliseconds >= (PATS.STARTS_MILLISECONDS[0] ?? 0) ? 'exact-position' : 'eased',
  };
}

/** The cooled tint after each pat; from the end of the pats it goes on, in a straight line, to the tint of the banked fire. */
function tintAmountAt(elapsedMilliseconds: number): number {
  if (elapsedMilliseconds >= PATS.HAND_GOES_MILLISECONDS) {
    const lastPatAmount = COOLING.TINT_AMOUNTS_AFTER_PATS[COOLING.TINT_AMOUNTS_AFTER_PATS.length - 1] ?? COOLING.BANKED_TINT_AMOUNT;
    const banked = progressBetween(elapsedMilliseconds, PATS.HAND_GOES_MILLISECONDS, BANK_FIRE.ENTRANCE_MILLISECONDS);
    return lastPatAmount + ((COOLING.BANKED_TINT_AMOUNT - lastPatAmount) * banked);
  }
  const patsDone = PATS.STARTS_MILLISECONDS.filter((patStart) => elapsedMilliseconds >= patStart + PATS.PAT_MILLISECONDS).length;
  return patsDone === 0 ? 0 : COOLING.TINT_AMOUNTS_AFTER_PATS[patsDone - 1] ?? 0;
}

function bankedEmberAt(elapsedMilliseconds: number): BankedEmberState {
  // Sleep starts ember n that long after its first one, so the rise is moved back to start this one at the end of the entrance.
  const risingSince = BANK_FIRE.ENTRANCE_MILLISECONDS - (BANKED_EMBER.EMBER_INDEX * EMBER_RISE.START_INTERVAL_MILLISECONDS);
  const ember = embersOf(risingSince, 1, elapsedMilliseconds)[BANKED_EMBER.EMBER_INDEX];
  if (ember === undefined) {
    return {
      shown: 0,
      ember: {
        x: 0, y: 0, turnDegrees: 0, opacity: 0
      }
    };
  }
  const risenUnits = (ember.y - EMBER_RISE.START_Y_UNITS) * BANKED_EMBER.RISE_SHARE;
  return { shown: 1, ember: { ...ember, y: EMBER_RISE.START_Y_UNITS + risenUnits } };
}

function bankedGlowAt(elapsedMilliseconds: number): number {
  const fadedIn = progressBetween(elapsedMilliseconds, BANKED_GLOW.GLOW_FADE_IN_STARTS_MILLISECONDS, BANK_FIRE.ENTRANCE_MILLISECONDS);
  return fadedIn * (BANKED_GLOW.GLOW_BASE_OPACITY + (BANKED_GLOW.GLOW_SWING_OPACITY * Math.sin(elapsedMilliseconds / BANKED_GLOW.GLOW_DIVISOR_MILLISECONDS)));
}

function bankFirePartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const firstPatEnds = (PATS.STARTS_MILLISECONDS[0] ?? 0) + PATS.PAT_MILLISECONDS;
  const isLowered = elapsedMilliseconds >= firstPatEnds;
  const closing = progressBetween(elapsedMilliseconds, COOLING.EYES_CLOSE_STARTS_MILLISECONDS, BANK_FIRE.ENTRANCE_MILLISECONDS);
  const tintAmount = tintAmountAt(elapsedMilliseconds);
  return {
    body: {
      hover:       BANK_FIRE.HOVER_UNITS,
      leanDegrees: BANK_FIRE.LEAN_DEGREES,
      ...(isLowered ? { heightFactor: COOLING.HEIGHT_FACTOR } : {}),
      ...(tintAmount > 0 ? { tint: { role: 'emberDark', amount: tintAmount } } : {}),
    },
    eyes:     { height: EYE_SHAPE.HEIGHT_UNITS + ((COOLING.BANKED_EYE_HEIGHT_UNITS - EYE_SHAPE.HEIGHT_UNITS) * closing) },
    nearHand: pattingHandAt(elapsedMilliseconds),
    farHand:  null,
    sleep:    { glowOpacity: bankedGlowAt(elapsedMilliseconds) },
    ...(elapsedMilliseconds >= BANK_FIRE.ENTRANCE_MILLISECONDS ? { props: { bankedEmber: bankedEmberAt(elapsedMilliseconds) } } : {}),
  };
}

export const BANK_FIRE_GESTURE = gestureDefinition({
  name:                  'bank-fire',
  intents:               { 'bank-fire': singleFormOf(null, BANK_FIRE.STILL_MOMENT_MILLISECONDS, BANK_FIRE_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            bankFirePartOf,
});
