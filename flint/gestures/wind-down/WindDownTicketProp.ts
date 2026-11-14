/**
 * The last ticket of Wind-down: a ready ticket at 80% around the paper's centre, with three printed lines and one more line that Flint
 * writes; the written line grows from its left end on the screen. It fades in and out and moves as the gesture gives.
 */
import { propDefinition }     from '../../props/PropDefinition.ts';
import { PaperShapeUtil }     from '../../props/shapes/PaperShapeUtil.ts';
import { writtenLineShapeOf } from '../../props/shapes/WrittenLineShape.ts';
import { PAPER_SHAPE }        from '../../props/shapes/constants/SharedShapes.ts';
import { LAST_TICKET }        from './constants/WindDownValues.ts';

export interface WindDownTicketState {
  readonly shown:         number;
  readonly writtenLength: number;
  /** Multiplies the opacity: the fade in and out the gesture times itself. */
  readonly fade:          number;
  readonly offsetX:       number;
  readonly offsetY:       number;
}

export const WIND_DOWN_TICKET_PROP = propDefinition({
  name:   'windDownTicket',
  hidden: Object.freeze<WindDownTicketState>({
    shown: 0, writtenLength: 0, fade: 1, offsetX: 0, offsetY: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: WindDownTicketState, context) => ({
    opacity:   state.shown * state.fade,
    transform: PaperShapeUtil.scaledPaperTransformOf({ x: state.offsetX + PAPER_SHAPE.CENTRE_X_UNITS, y: state.offsetY + PAPER_SHAPE.CENTRE_Y_UNITS }, LAST_TICKET.SCALE),
    shapes:    [
      PaperShapeUtil.paperOf({ key: 'paper' }),
      PaperShapeUtil.headerOf('header'),
      ...LAST_TICKET.PRINTED_LINE_Y_UNITS.map((lineY, i) => writtenLineShapeOf({
        key:           `printed-line-${i}`,
        startX:        LAST_TICKET.LINE_START_X_UNITS,
        startY:        lineY,
        fullLength:    LAST_TICKET.FULL_LINE_UNITS,
        writtenLength: LAST_TICKET.FULL_LINE_UNITS,
        facing:        context.facing,
        stroke:        'paperText',
      })),
      writtenLineShapeOf({
        key:           'written-line',
        startX:        LAST_TICKET.LINE_START_X_UNITS,
        startY:        LAST_TICKET.WRITTEN_LINE_Y_UNITS,
        fullLength:    LAST_TICKET.FULL_LINE_UNITS,
        writtenLength: state.writtenLength,
        facing:        context.facing,
      }),
    ],
  }),
});
