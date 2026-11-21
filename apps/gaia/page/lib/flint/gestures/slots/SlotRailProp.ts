/**
 * The rail of Slots (`06-more-animations.md`): a rail with three sockets on stems, the spark of a Watcher in each filled socket, and the
 * mini sheet of a ticket that waits for a socket. A socket's ring is graphite when free, the body colour when its spark is in, and crimson
 * while it refuses a ticket. A hand held to this prop holds the mini sheet at its lower left.
 */
import type { Point }              from '../../SpriteGeometry.ts';
import type { FlintColourRole }    from '../../constants/Palette.ts';
import type { Shape }              from '../../drawing/Shape.ts';
import { propDefinition }          from '../../props/PropDefinition.ts';
import { PaperShapeUtil }          from '../../props/shapes/PaperShapeUtil.ts';
import { SparkShapeUtil }          from '../../props/shapes/SparkShapeUtil.ts';
import { SLOTS_FULL, SLOTS_SHAPE } from './constants/SlotsValues.ts';

export type SocketLight = 'free' | 'lit' | 'refusing';

export interface SlotsSparkState {
  readonly y:       number;
  readonly scale:   number;
  readonly opacity: number;
}

export interface SlotsState {
  readonly shown:        number;
  readonly sceneOpacity: number;
  readonly sockets:      readonly SocketLight[];
  readonly sparks:       readonly SlotsSparkState[];
  readonly sheetOpacity: number;
  /** The centre of the mini sheet. */
  readonly sheetX:       number;
  readonly sheetY:       number;
}

const RING_COLOURS: Readonly<Record<SocketLight, FlintColourRole>> = Object.freeze({ free: 'graphite', lit: 'body', refusing: 'alarm' });

function socketShapesOf(state: SlotsState): readonly Shape[] {
  return SLOTS_SHAPE.SOCKET_X_UNITS.flatMap((socketX, i): readonly Shape[] => [
    {
      kind:        'line',
      key:         `stem-${i}`,
      x1:          socketX,
      y1:          SLOTS_SHAPE.SOCKET_Y_UNITS + SLOTS_SHAPE.SOCKET_RADIUS_UNITS,
      x2:          socketX,
      y2:          SLOTS_SHAPE.RAIL_Y_UNITS,
      stroke:      'graphite',
      strokeWidth: SLOTS_SHAPE.STROKE_UNITS,
      opacity:     state.sceneOpacity,
    },
    {
      kind:        'circle',
      key:         `socket-${i}`,
      centreX:     socketX,
      centreY:     SLOTS_SHAPE.SOCKET_Y_UNITS,
      radius:      SLOTS_SHAPE.SOCKET_RADIUS_UNITS,
      ...(state.sockets[i] === 'refusing' ? { fill: 'alarm', fillOpacity: SLOTS_SHAPE.REFUSING_FILL_OPACITY } : { fill: 'none' }),
      stroke:      RING_COLOURS[state.sockets[i] ?? 'free'],
      strokeWidth: SLOTS_SHAPE.STROKE_UNITS,
      opacity:     state.sceneOpacity,
    },
  ]);
}

/** Each spark at its socket's x, scaled around its own centre. */
function sparkShapesOf(state: SlotsState): readonly Shape[] {
  return state.sparks.flatMap((spark, i) => {
    return SparkShapeUtil.sparkOf({
      key: `spark-${i}`, centreX: SLOTS_SHAPE.SOCKET_X_UNITS[i] ?? 0, centreY: spark.y, opacity: spark.opacity, scale: spark.scale,
    });
  });
}

export const SLOT_RAIL_PROP = propDefinition({
  name:   'slotRail',
  hidden: Object.freeze<SlotsState>({
    shown:        0,
    sceneOpacity: 0,
    sockets:      Object.freeze<SocketLight[]>(['free', 'free', 'free']),
    sparks:       Object.freeze(SLOTS_SHAPE.SOCKET_X_UNITS.map(() => Object.freeze({ y: SLOTS_SHAPE.SOCKET_Y_UNITS, scale: 1, opacity: 0 }))),
    sheetOpacity: 0,
    sheetX:       SLOTS_FULL.REST_X_UNITS,
    sheetY:       SLOTS_FULL.REST_Y_UNITS,
  }),
  layer:    'in-front-of-body',
  gripOf:   (state: SlotsState): Point => ({ x: state.sheetX + SLOTS_FULL.GRIP_OFFSET_X_UNITS, y: state.sheetY + SLOTS_FULL.GRIP_OFFSET_Y_UNITS }),
  shapesOf: (state: SlotsState) => ({
    opacity: state.shown,
    shapes:  [
      {
        kind:         'rectangle',
        key:          'rail',
        x:            SLOTS_SHAPE.RAIL_X_UNITS,
        y:            SLOTS_SHAPE.RAIL_Y_UNITS,
        width:        SLOTS_SHAPE.RAIL_WIDTH_UNITS,
        height:       SLOTS_SHAPE.RAIL_HEIGHT_UNITS,
        cornerRadius: SLOTS_SHAPE.RAIL_CORNER_RADIUS_UNITS,
        fill:         'hardware',
        stroke:       'graphite',
        strokeWidth:  SLOTS_SHAPE.STROKE_UNITS,
        opacity:      state.sceneOpacity,
      },
      ...socketShapesOf(state),
      ...sparkShapesOf(state),
      {
        ...PaperShapeUtil.paperOf({ key: 'sheet' }),
        opacity:   state.sheetOpacity,
        transform: PaperShapeUtil.miniSheetTransformOf({ x: state.sheetX, y: state.sheetY }),
      },
    ],
  }),
});
