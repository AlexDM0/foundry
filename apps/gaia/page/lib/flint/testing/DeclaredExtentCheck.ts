/**
 * How far a declared extent is from what is drawn: each side's excess over the drawing, which is negative where the declaration falls
 * short. A declaration holds when no side falls short and none exceeds the drawing by more than the rounding a declaration keeps.
 */
import type { DrawnExtent } from '../SpriteGeometry.ts';

/** A declaration is the drawn extent rounded up to this step. */
export const DECLARED_EXTENT_STEP_UNITS = 0.5;

const SIDES = ['backUnits', 'frontUnits', 'aboveFloorUnits', 'belowFloorUnits'] as const;

/** The sides where the declaration does not hold, with the declared and the drawn value; empty when it holds. */
export function extentMisdeclarationsOf(declared: DrawnExtent, drawn: DrawnExtent): readonly string[] {
  return SIDES.flatMap((side) => {
    const excessUnits = declared[side] - drawn[side];
    const holds = excessUnits >= 0 && excessUnits <= DECLARED_EXTENT_STEP_UNITS;
    return holds ? [] : [`${side}: declared ${declared[side]}, drawn ${drawn[side].toFixed(2)}`];
  });
}
