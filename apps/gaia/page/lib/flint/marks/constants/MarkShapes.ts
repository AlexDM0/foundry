/**
 * What the marks share. A mark sits at its anchor, relative to the bottom tip of the body; the anchor's x follows the
 * facing, the mark itself never mirrors.
 */

/** "!", "?" and "Hi!" share their type. */
export const MARK_TEXT_SHAPE = {
  FONT_FAMILY:      'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  FONT_WEIGHT:      700,
  BASELINE_Y_UNITS: 5,
} as const;

/** "!", "?", the thinking dots, the lightbulb and the glints share this anchor. */
export const SHARED_MARK_ANCHOR = {
  ANCHOR_X_UNITS: 20,
  ANCHOR_Y_UNITS: -54,
  SCALE:          1.5,
} as const;
