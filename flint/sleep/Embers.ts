/**
 * Implements `02-animations.md`, "Sleep", "Embers": four squares that rise behind Flint, one after another, each on its own repeating
 * cycle. They are never mirrored; `flint/sleep/SleepSequence.ts` decides when they rise and when they fade out.
 */
import type { EmberPose }           from '../SpritePose.ts';
import { EASING_RATES_PER_SECOND }  from '../constants/Easing.ts';
import { EMBER_RISE, EMBER_SHAPES } from '../constants/SleepMotion.ts';
import { AnimationCurveUtil }       from '../utils/AnimationCurveUtil.ts';

/** Embers that rose since one moment and fade out, at the waking rate, since a later one. */
export interface FadingEmbers {
  readonly risingSinceMilliseconds: number;
  readonly fadingSinceMilliseconds: number;
}

/** What is left of fading embers' opacity, from 1 when they start to fade towards 0. */
export function emberFadeAt(embers: FadingEmbers, elapsedMilliseconds: number): number {
  return 1 - AnimationCurveUtil.easingFractionOf(EASING_RATES_PER_SECOND.WAKING, Math.max(0, elapsedMilliseconds - embers.fadingSinceMilliseconds));
}

function emberOpacityAt(progress: number): number {
  return progress < EMBER_RISE.FADE_IN_PROGRESS ? progress / EMBER_RISE.FADE_IN_PROGRESS : 1 - progress;
}

/** Every ember, relative to the bottom tip with the hover; an ember that has not started yet shows at opacity 0. */
export function embersOf(risingSinceMilliseconds: number, fade: number, elapsedMilliseconds: number): EmberPose[] {
  return EMBER_SHAPES.map((_shape, i) => {
    const emberMilliseconds = elapsedMilliseconds - risingSinceMilliseconds - (i * EMBER_RISE.START_INTERVAL_MILLISECONDS);
    const hasStarted = emberMilliseconds > 0;
    const progress = hasStarted ? AnimationCurveUtil.cycleProgressOf(emberMilliseconds, EMBER_RISE.CYCLE_MILLISECONDS) : 0;
    const side = i % 2 === 0 ? 1 : -1;
    return {
      x:           (side * (EMBER_RISE.BASE_X_UNITS + (EMBER_RISE.STEP_X_UNITS * i))) + (side * EMBER_RISE.DRIFT_X_UNITS * Math.sin(Math.PI * progress)),
      y:           EMBER_RISE.START_Y_UNITS - (EMBER_RISE.RISE_UNITS * progress),
      turnDegrees: EMBER_RISE.START_TURN_DEGREES + (side * EMBER_RISE.TURN_SPREAD_DEGREES * progress),
      opacity:     hasStarted ? emberOpacityAt(progress) * fade : 0,
    };
  });
}
