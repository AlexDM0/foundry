/** Idle: the hover and the blink, as functions of the frame source's elapsed time. */
import { BLINK, HOVER } from '../constants/Motion.ts';

export const IdleMotionUtil = Object.freeze({
  hoverHeightAt: (elapsedMilliseconds: number): number => HOVER.HEIGHT_UNITS + (HOVER.SWING_UNITS * Math.sin(elapsedMilliseconds / HOVER.SWING_DIVISOR_MILLISECONDS)),

  /** The eyes are shut for the first moment of each blink interval; the mind lets Flint blink only while it does nothing else. */
  blinkIsClosedAt: (elapsedMilliseconds: number): boolean => elapsedMilliseconds % BLINK.INTERVAL_MILLISECONDS < BLINK.CLOSED_MILLISECONDS,
});
