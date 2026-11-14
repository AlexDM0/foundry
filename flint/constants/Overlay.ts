import { FLINT_OVERLAY_ATTRIBUTE } from '../SpriteHabitat.ts';

/** The overlay Flint draws in: its marks in the host's document, which the one-Flint rule and the drop target read. */
export const OVERLAY = {
  /** The attribute that marks Flint's overlay; a second `createFlint` on a document that holds one is refused. */
  MARKER_ATTRIBUTE:         FLINT_OVERLAY_ATTRIBUTE,
  STACK_LEVEL:              1000,
  BULB_GLASS_GRADIENT_ID:   'flint-bulb-glass',
  BULB_FITTING_GRADIENT_ID: 'flint-bulb-fitting',
  OCCLUSION_CLIP_ID:        'flint-occlusion',
  /** Far wider than any page, so the visible side of an occluding edge is never cut off. */
  OCCLUSION_EXTENT_UNITS:   100000,
  ATTRIBUTE_DECIMALS:       2,
} as const;

export const DEFAULT_PIXELS_FOR_ONE_UNIT = 1;

export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/** Flint never goes into a habitat whose box is narrower or lower than this. */
export const HABITAT_MINIMUM_SIDE_PIXELS = 100;
