/** The plain geometry every part of Flint shares: a point in sprite units and the side Flint faces. */

/** 1 when Flint faces right, -1 when it faces left. */
export type Facing = 1 | -1;

export interface Point {
  readonly x: number;
  readonly y: number;
}
