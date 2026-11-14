/** Wander of `03-behaviour-and-architecture.md`: how long Flint rests between its walks. The values are not in the handoff. */
export const WANDER = {
  REST_SHORTEST_MILLISECONDS: 2500,
  REST_SPREAD_MILLISECONDS:   3000,
  /** A walk shorter than this is not worth the steps: Flint rests again. */
  SHORTEST_WALK_UNITS:        12,
} as const;
