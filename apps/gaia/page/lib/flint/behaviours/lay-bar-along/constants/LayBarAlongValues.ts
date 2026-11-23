/**
 * Lay the bar along a row: Flint walks to the left end of the host's bar, rises to its bottom edge, lays it from
 * the left end to the right end with the `lay-bar` gesture, and leaves a fresh shimmer over it. In sprite units and milliseconds.
 */
export const LAY_BAR_ALONG = {
  /** The lay takes the time this speed gives over the bar's width, clamped between the shortest and the longest. */
  LAY_SPEED_UNITS_PER_SECOND: 110,
  SHORTEST_LAY_MILLISECONDS:  1500,
  LONGEST_LAY_MILLISECONDS:   6000,
  /** A narrower bar is not walked: Flint goes to it, rises and is happy. */
  NARROWEST_WALKED_UNITS:     40,
} as const;

/** The shimmer over the host's bar, behind Flint: it fades out part by part, drawn as segments with the opacity of their age. */
export const LAY_BAR_ALONG_SHIMMER = {
  /** Its end nearest Flint is this far behind Flint, as the bar of `lay-bar`. */
  BEHIND_FLINT_UNITS:       18,
  CORNER_RADIUS_UNITS:      3,
  OPACITY:                  0.5,
  /** The part nearest Flint is in the body colour. */
  HEAD_LENGTH_UNITS:        6,
  HEAD_OPACITY:             0.7,
  /** Each part has faded out this long after Flint passed it. */
  FADES_AFTER_MILLISECONDS: 800,
  SEGMENT_COUNT:            4,
  /** After the lay, or when the behaviour ends early, the shimmer fades out in this time. */
  FADE_OUT_MILLISECONDS:    400,
} as const;
