/** The plain geometry every part of Flint shares: a point in sprite units and the side Flint faces. */

/** 1 when Flint faces right, -1 when it faces left. */
export type Facing = 1 | -1;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * How far a drawing reaches from the bottom tip of the body on its floor, in sprite units, for Flint facing right: behind it, in front of
 * it, above the floor and below it (negative while all of it stays above the floor).
 */
export interface DrawnExtent {
  readonly backUnits:       number;
  readonly frontUnits:      number;
  readonly aboveFloorUnits: number;
  readonly belowFloorUnits: number;
}
