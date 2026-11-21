/** The looking glass of Review (`02-animations.md`, "Review") as it reads a line of the sheet, which every gesture that reads it shares. */
import type { Point }   from '../SpriteGeometry.ts';
import { SHEET_SHAPE }  from '../props/shapes/constants/SheetShape.ts';
import { READING_LENS } from './constants/ReadingLens.ts';

export const ReadingLensUtil = Object.freeze({
  /** The lens's centre on line `lineIndex`, `across` from its left end on the screen, from 0 to 1. */
  lensCentreOf: (lineIndex: number, across: number): Point => ({
    x: READING_LENS.START_X_UNITS + (READING_LENS.TRAVEL_UNITS * across),
    y: SHEET_SHAPE.FIRST_LINE_Y_UNITS + (SHEET_SHAPE.LINE_SPACING_UNITS * lineIndex) + (SHEET_SHAPE.LINE_DROP_UNITS * across) + READING_LENS.BELOW_LINE_UNITS,
  }),

  /** The eyes follow the lens: down a line at a time, and along the line. */
  readingEyesOf: (lineIndex: number, across: number): { readonly lift: number; readonly shift: number } => ({
    lift:  READING_LENS.EYE_LIFT_FIRST_LINE_UNITS + (READING_LENS.EYE_LIFT_PER_LINE_UNITS * lineIndex),
    shift: READING_LENS.EYE_SHIFT_START_UNITS + (READING_LENS.EYE_SHIFT_TRAVEL_UNITS * across),
  }),
});
