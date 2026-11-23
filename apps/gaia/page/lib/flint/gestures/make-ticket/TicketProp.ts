/**
 * The ticket of Make a ticket: the paper with its header, the three lines Flint writes, and the seal of the stamp. It
 * fades in and out within its cycle and moves when Flint files it; a written line grows from its left end on the screen.
 */
import type { Shape }         from '../../drawing/Shape.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { PaperShapeUtil }     from '../../props/shapes/PaperShapeUtil.ts';
import { writtenLineShapeOf } from '../../props/shapes/WrittenLineShape.ts';
import { TICKET_SHAPE }       from './constants/MakeTicketValues.ts';

export interface TicketState {
  readonly shown:          number;
  /** Multiplies the opacity: the fade in and out of one ticket in its cycle. */
  readonly cycleOpacity:   number;
  readonly writtenLengths: readonly number[];
  readonly sealShown:      boolean;
  readonly offsetX:        number;
  readonly offsetY:        number;
}

export const TICKET_PROP = propDefinition({
  name:   'ticket',
  hidden: Object.freeze<TicketState>({
    shown: 0, cycleOpacity: 1, writtenLengths: Object.freeze(TICKET_SHAPE.LINE_Y_UNITS.map(() => 0)), sealShown: false, offsetX: 0, offsetY: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: TicketState, context) => {
    const sealHalf = TICKET_SHAPE.SEAL_SIDE_UNITS / 2;
    const seal: Shape = {
      kind:      'rectangle',
      key:       'seal',
      x:         TICKET_SHAPE.SEAL_CENTRE_X_UNITS - sealHalf,
      y:         TICKET_SHAPE.SEAL_CENTRE_Y_UNITS - sealHalf,
      width:     TICKET_SHAPE.SEAL_SIDE_UNITS,
      height:    TICKET_SHAPE.SEAL_SIDE_UNITS,
      fill:      'body',
      transform: [{ rotateDegrees: TICKET_SHAPE.SEAL_TURN_DEGREES, aboutX: TICKET_SHAPE.SEAL_CENTRE_X_UNITS, aboutY: TICKET_SHAPE.SEAL_CENTRE_Y_UNITS }],
      opacity:   state.sealShown ? 1 : 0,
    };
    return {
      opacity:   state.shown * state.cycleOpacity,
      transform: [{ translateX: state.offsetX, translateY: state.offsetY }],
      shapes:    [
        PaperShapeUtil.paperOf({ key: 'paper' }),
        PaperShapeUtil.headerOf('header'),
        ...TICKET_SHAPE.LINE_Y_UNITS.map((lineY, i) => writtenLineShapeOf({
          key:           `line-${i}`,
          startX:        TICKET_SHAPE.LINE_START_X_UNITS,
          startY:        lineY,
          fullLength:    TICKET_SHAPE.FULL_LINE_UNITS,
          writtenLength: state.writtenLengths[i] ?? 0,
          facing:        context.facing,
        })),
        seal,
      ],
    };
  },
});
