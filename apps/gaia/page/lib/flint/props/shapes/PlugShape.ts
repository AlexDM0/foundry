/** The plug of Forced stop, which Unplugged shares: a graphite block with two prongs, which go into a socket. */
import type { Shape } from '../../drawing/Shape.ts';
import { PLUG_SHAPE } from './constants/SharedShapes.ts';

export interface PlugOptions {
  /** The top left corner of the block. */
  readonly x:        number;
  readonly y:        number;
  readonly opacity?: number;
}

/** The prongs come first, so a socket drawn after them hides them once the plug is in. */
export function plugShapesOf(options: PlugOptions): readonly Shape[] {
  const faded = options.opacity === undefined ? {} : { opacity: options.opacity };
  return [
    ...PLUG_SHAPE.PRONG_DROPS_UNITS.map((drop, i): Shape => ({
      kind:   'rectangle',
      key:    `prong-${i}`,
      x:      options.x + PLUG_SHAPE.WIDTH_UNITS,
      y:      options.y + drop,
      width:  PLUG_SHAPE.PRONG_LENGTH_UNITS,
      height: PLUG_SHAPE.PRONG_HEIGHT_UNITS,
      fill:   'graphite',
      ...faded,
    })),
    {
      kind: 'rectangle', key: 'plug', x: options.x, y: options.y, width: PLUG_SHAPE.WIDTH_UNITS, height: PLUG_SHAPE.HEIGHT_UNITS, fill: 'graphite', ...faded,
    },
  ];
}
