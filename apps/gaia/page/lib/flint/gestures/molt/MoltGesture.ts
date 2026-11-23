/**
 * Molt: a full context spills pages while the body strains and sweats; then Flint sheds a husk that
 * falls behind it, hops out bright and glowing, and ends happy. The husk is held still on the screen through the hop, so only Flint hops.
 */
import type { EmoteMarkPose, EyesPose, PosePart } from '../../SpritePose.ts';
import { AnimationCurveUtil }                     from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                      from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }        from '../GestureDefinition.ts';
import { GestureMarkUtil }                        from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }                    from '../GestureTimelineUtil.ts';
import type { MoltHuskState }                     from './MoltHuskProp.ts';
import type { SpilledPageState }                  from './SpilledPagesProp.ts';
import {
  HUSK,
  MOLT,
  RENEWAL,
  SHED,
  SPILLED_PAGES,
  STRAIN,
} from './constants/MoltValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** The sweat drop of the strain, then the happy glints of the renewal. */
function markAt(elapsedMilliseconds: number): EmoteMarkPose | null {
  return GestureMarkUtil.sweatDropIn(elapsedMilliseconds, { startMilliseconds: 0, endMilliseconds: STRAIN.ENDS_MILLISECONDS })
    ?? GestureMarkUtil.springingMarkIn('happy-glints', elapsedMilliseconds, {
      startMilliseconds: RENEWAL.GLINTS_START_MILLISECONDS,
      endMilliseconds:   RENEWAL.GLINTS_END_MILLISECONDS,
    });
}

/** Each page flies up out of the top and falls to its side, turning; the side changes from page to page. */
function spilledPagesAt(elapsedMilliseconds: number): SpilledPageState[] {
  return Array.from({ length: SPILLED_PAGES.COUNT }, (_unused, i) => {
    const flight = (elapsedMilliseconds - (i * SPILLED_PAGES.INTERVAL_MILLISECONDS)) / SPILLED_PAGES.FLIGHT_MILLISECONDS;
    const progress = AnimationCurveUtil.clamp(flight);
    const side = i % 2 === 0 ? 1 : -1;
    const isFlying = flight > 0 && flight < 1;
    const fading = AnimationCurveUtil.clamp((progress - SPILLED_PAGES.FADE_FROM_PROGRESS) / (1 - SPILLED_PAGES.FADE_FROM_PROGRESS));
    return {
      x:           side * (SPILLED_PAGES.START_X_UNITS + (SPILLED_PAGES.TRAVEL_X_UNITS * progress)),
      y:           SPILLED_PAGES.TOP_Y_UNITS - (SPILLED_PAGES.RISE_UNITS * progress) + (SPILLED_PAGES.FALL_UNITS * progress * progress),
      turnDegrees: side * SPILLED_PAGES.TURN_DEGREES * progress,
      opacity:     isFlying ? 1 - fading : 0,
    };
  });
}

function hopLiftAt(elapsedMilliseconds: number): number {
  const hop = progressBetween(elapsedMilliseconds, SHED.MILLISECONDS, SHED.HOP_ENDS_MILLISECONDS);
  return hop > 0 && hop < 1 ? SHED.HOP_UNITS * Math.sin(Math.PI * hop) : 0;
}

/** The husk falls back from where the body was; it moves down by the hop, so it stays on the screen while Flint hops out of it. */
function huskAt(elapsedMilliseconds: number): MoltHuskState {
  const fallen = progressBetween(elapsedMilliseconds, SHED.MILLISECONDS, HUSK.FALL_ENDS_MILLISECONDS);
  return {
    shown:       1,
    offsetX:     HUSK.END_X_UNITS * fallen,
    offsetY:     (HUSK.END_Y_UNITS * fallen) + hopLiftAt(elapsedMilliseconds),
    turnDegrees: HUSK.END_TURN_DEGREES * fallen,
    opacity:     HUSK.OPACITY * (1 - fallen),
  };
}

function eyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const happiness = elapsedMilliseconds >= RENEWAL.HAPPY_EYES_MILLISECONDS ? { happiness: 1 } : {};
  if (elapsedMilliseconds < RENEWAL.STARTS_MILLISECONDS) return { height: STRAIN.EYE_HEIGHT_UNITS };
  const height = elapsedMilliseconds < RENEWAL.SETTLES_MILLISECONDS ? RENEWAL.WIDE_EYE_HEIGHT_UNITS : RENEWAL.SETTLED_EYE_HEIGHT_UNITS;
  return { height, ...happiness };
}

function moltPartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const isStraining = elapsedMilliseconds < STRAIN.ENDS_MILLISECONDS;
  const isShed = elapsedMilliseconds >= SHED.MILLISECONDS;
  const isBright = isShed && elapsedMilliseconds < SHED.TINT_FADE_ENDS_MILLISECONDS;
  const tintFaded = progressBetween(elapsedMilliseconds, SHED.TINT_FADE_STARTS_MILLISECONDS, SHED.TINT_FADE_ENDS_MILLISECONDS);
  const isRenewing = elapsedMilliseconds >= RENEWAL.STARTS_MILLISECONDS && elapsedMilliseconds < RENEWAL.ENDS_MILLISECONDS;
  const glowFaded = progressBetween(elapsedMilliseconds, RENEWAL.STARTS_MILLISECONDS, RENEWAL.ENDS_MILLISECONDS);
  const isSpilling = elapsedMilliseconds < (SPILLED_PAGES.INTERVAL_MILLISECONDS * (SPILLED_PAGES.COUNT - 1)) + SPILLED_PAGES.FLIGHT_MILLISECONDS;
  const isHuskShown = isShed && elapsedMilliseconds < HUSK.FALL_ENDS_MILLISECONDS;
  return {
    body: {
      ...(isStraining ? { widthFactor: 1 + (STRAIN.WIDTH_FACTOR * Math.sin(elapsedMilliseconds / STRAIN.DIVISOR_MILLISECONDS)) } : {}),
      ...(isBright ? { tint: { role: 'emberLight', amount: SHED.BRIGHT_TINT_AMOUNT * (1 - tintFaded) } } : {}),
      addedLift: hopLiftAt(elapsedMilliseconds),
    },
    eyes:      eyesAt(elapsedMilliseconds),
    nearHand:  null,
    farHand:   null,
    emoteMark: markAt(elapsedMilliseconds),
    props:     {
      ...(isSpilling ? { spilledPages: { shown: 1, pages: spilledPagesAt(elapsedMilliseconds) } } : {}),
      ...(isHuskShown ? { moltHusk: huskAt(elapsedMilliseconds) } : {}),
    },
    ...(isRenewing ? { sleep: { glowOpacity: RENEWAL.GLOW_OPACITY * (1 - glowFaded) } } : {}),
    ...(isBright ? { exactFields: ['tint'] } : {}),
  };
}

export const MOLT_GESTURE = gestureDefinition({
  name:                  'molt',
  intents:               { molt: singleFormOf(MOLT.DURATION_MILLISECONDS, MOLT.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            moltPartOf,
});
