/** The gauge of the shared vocabulary (`06-more-animations.md`): a budget, its level a bar from the bottom. */
import type { FlintColourRole } from '../../constants/Palette.ts';
import type { Shape }           from '../../drawing/Shape.ts';
import { GAUGE_SHAPE }          from './constants/SharedShapes.ts';

export interface GaugeOptions {
  readonly key:           string;
  /** The top left corner. */
  readonly x:             number;
  readonly y:             number;
  /** From 0 empty to 1 full. */
  readonly level:         number;
  readonly levelColour:   FlintColourRole;
  readonly levelOpacity?: number;
}

export function gaugeShapesOf(options: GaugeOptions): readonly Shape[] {
  const levelHeight = GAUGE_SHAPE.FULL_LEVEL_UNITS * options.level;
  return [
    {
      kind:         'rectangle',
      key:          options.key,
      x:            options.x,
      y:            options.y,
      width:        GAUGE_SHAPE.WIDTH_UNITS,
      height:       GAUGE_SHAPE.HEIGHT_UNITS,
      cornerRadius: GAUGE_SHAPE.CORNER_RADIUS_UNITS,
      fill:         'paper',
      stroke:       'graphite',
      strokeWidth:  GAUGE_SHAPE.STROKE_UNITS,
    },
    {
      kind:   'rectangle',
      key:    `${options.key}-level`,
      x:      options.x + GAUGE_SHAPE.LEVEL_INSET_UNITS,
      y:      options.y + GAUGE_SHAPE.LEVEL_INSET_UNITS + GAUGE_SHAPE.FULL_LEVEL_UNITS - levelHeight,
      width:  GAUGE_SHAPE.LEVEL_WIDTH_UNITS,
      height: levelHeight,
      fill:   options.levelColour,
      ...(options.levelOpacity === undefined ? {} : { opacity: options.levelOpacity }),
    },
  ];
}
