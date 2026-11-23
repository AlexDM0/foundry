/**
 * The looking glass of Review: the lens grows from scale 0 with its shown level, and its centre eases at the hand
 * rate. A hand held to it sits at the grip point on every frame, so the hand and the glass move as one rigid part; the handle runs from
 * the edge of the lens to that hand while the hand is larger than its minimum.
 */
import type { Point }          from '../../SpriteGeometry.ts';
import type { Shape }          from '../../drawing/Shape.ts';
import type { HoldingHand }    from '../PropDefinition.ts';
import { propDefinition }      from '../PropDefinition.ts';
import { PropEasingUtil }      from '../PropEasingUtil.ts';
import { LOOKING_GLASS_SHAPE } from './constants/LookingGlassValues.ts';

export interface LookingGlassState {
  readonly shown:   number;
  readonly centreX: number;
  readonly centreY: number;
}

function handleShapesOf(state: LookingGlassState, hand: HoldingHand | null): readonly Shape[] {
  if (hand === null || hand.radius <= LOOKING_GLASS_SHAPE.HANDLE_MINIMUM_HAND_RADIUS_UNITS) return [];
  const gripX = hand.centreX - state.centreX;
  const gripY = hand.centreY - state.centreY;
  const gripLength = Math.max(1, Math.hypot(gripX, gripY));
  return [{
    kind:        'line',
    key:         'handle',
    x1:          state.centreX + (gripX / gripLength * LOOKING_GLASS_SHAPE.LENS_RADIUS_UNITS),
    y1:          state.centreY + (gripY / gripLength * LOOKING_GLASS_SHAPE.LENS_RADIUS_UNITS),
    x2:          hand.centreX,
    y2:          hand.centreY,
    stroke:      'graphite',
    strokeWidth: LOOKING_GLASS_SHAPE.HANDLE_STROKE_UNITS,
    lineCap:     'round',
    opacity:     state.shown,
  }];
}

export const LOOKING_GLASS_PROP = propDefinition({
  name:    'lookingGlass',
  hidden:  Object.freeze<LookingGlassState>({ shown: 0, centreX: LOOKING_GLASS_SHAPE.RESTING_CENTRE_X_UNITS, centreY: LOOKING_GLASS_SHAPE.RESTING_CENTRE_Y_UNITS }),
  layer:   'in-front-of-body',
  easedOf: (drawn: LookingGlassState, target: LookingGlassState, handFraction: number) => {
    const eased = PropEasingUtil.easedShownLevelOf(drawn, target, handFraction);
    if (target.shown === 0) return eased;
    return {
      ...eased,
      centreX: PropEasingUtil.easedTowards(drawn.centreX, target.centreX, handFraction),
      centreY: PropEasingUtil.easedTowards(drawn.centreY, target.centreY, handFraction),
    };
  },
  gripOf:   (state: LookingGlassState): Point => ({ x: state.centreX + LOOKING_GLASS_SHAPE.GRIP_OFFSET_X_UNITS, y: state.centreY + LOOKING_GLASS_SHAPE.GRIP_OFFSET_Y_UNITS, }),
  shapesOf: (state: LookingGlassState, context) => ({
    shapes: [
      ...handleShapesOf(state, context.holdingHand),
      {
        kind:        'circle',
        key:         'lens',
        centreX:     0,
        centreY:     0,
        radius:      LOOKING_GLASS_SHAPE.LENS_RADIUS_UNITS,
        fill:        'lens',
        fillOpacity: LOOKING_GLASS_SHAPE.LENS_OPACITY,
        stroke:      'graphite',
        strokeWidth: LOOKING_GLASS_SHAPE.RING_STROKE_UNITS,
        opacity:     state.shown,
        transform:   [{ translateX: state.centreX, translateY: state.centreY }, { scaleX: state.shown, scaleY: state.shown }],
      },
    ],
  }),
});
