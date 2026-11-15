/** The note of Gate failed (`06-more-animations.md`): a paper card with a crimson edge and a small cross at its centre, never mirrored. */
import { propDefinition }             from '../../props/PropDefinition.ts';
import { VerdictShapeUtil }           from '../../props/shapes/VerdictShapeUtil.ts';
import { CROSS_SHAPE, VERDICT_SHAPE } from '../../props/shapes/constants/SharedShapes.ts';
import { GATE_NOTE_SHAPE }            from './constants/GateFailedValues.ts';

export interface GateNoteState {
  readonly shown:   number;
  /** The y of its top edge; its x does not change. */
  readonly topY:    number;
  /** Multiplies the opacity: the fade at the end of the action. */
  readonly opacity: number;
}

const SMALL_CROSS_HALF_SIDE_UNITS = (CROSS_SHAPE.SIDE_UNITS * VERDICT_SHAPE.SMALL_SCALE) / 2;

export const GATE_NOTE_PROP = propDefinition({
  name:     'gateNote',
  hidden:   Object.freeze<GateNoteState>({ shown: 0, topY: GATE_NOTE_SHAPE.LANDED_TOP_Y_UNITS, opacity: 1 }),
  layer:    'in-front-of-body',
  shapesOf: (state: GateNoteState) => ({
    opacity: state.shown * state.opacity,
    shapes:  [
      {
        kind:        'rectangle',
        key:         'note',
        x:           GATE_NOTE_SHAPE.X_UNITS,
        y:           state.topY,
        width:       GATE_NOTE_SHAPE.WIDTH_UNITS,
        height:      GATE_NOTE_SHAPE.HEIGHT_UNITS,
        fill:        'paper',
        stroke:      'alarm',
        strokeWidth: GATE_NOTE_SHAPE.STROKE_UNITS,
      },
      VerdictShapeUtil.crossOf({
        key:     'cross',
        startX:  GATE_NOTE_SHAPE.X_UNITS + (GATE_NOTE_SHAPE.WIDTH_UNITS / 2) - SMALL_CROSS_HALF_SIDE_UNITS,
        startY:  state.topY + (GATE_NOTE_SHAPE.HEIGHT_UNITS / 2) - SMALL_CROSS_HALF_SIDE_UNITS,
        opacity: 1,
        scale:   VERDICT_SHAPE.SMALL_SCALE,
      }),
    ],
  }),
});
