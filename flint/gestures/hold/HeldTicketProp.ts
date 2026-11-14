/** The held ticket of Held (`06-more-animations.md`): a ready ticket at 80% with a graphite clamp over its top edge. */
import { propDefinition }    from '../../props/PropDefinition.ts';
import { PaperShapeUtil }    from '../../props/shapes/PaperShapeUtil.ts';
import { PAPER_SHAPE }       from '../../props/shapes/constants/SharedShapes.ts';
import { HELD_TICKET_SHAPE } from './constants/HoldValues.ts';

export interface HeldTicketState {
  readonly shown:        number;
  /** The fade of its entrance. */
  readonly opacity:      number;
  /** Negative is above its place: the clamp slides down to 0. */
  readonly clampOffsetY: number;
}

const TICKET_TRANSFORM = PaperShapeUtil.scaledPaperTransformOf({ x: PAPER_SHAPE.CENTRE_X_UNITS, y: PAPER_SHAPE.CENTRE_Y_UNITS }, HELD_TICKET_SHAPE.TICKET_SCALE);

export const HELD_TICKET_PROP = propDefinition({
  name:     'heldTicket',
  hidden:   Object.freeze<HeldTicketState>({ shown: 0, opacity: 0, clampOffsetY: -HELD_TICKET_SHAPE.CLAMP_SLIDE_UNITS }),
  layer:    'behind-body',
  shapesOf: (state: HeldTicketState) => ({
    opacity: state.shown * state.opacity,
    shapes:  [
      { ...PaperShapeUtil.paperOf({ key: 'paper' }), transform: TICKET_TRANSFORM },
      { ...PaperShapeUtil.headerOf('header'), transform: TICKET_TRANSFORM },
      {
        kind: 'path', key: 'clamp', pathData: HELD_TICKET_SHAPE.CLAMP_PATH, fill: 'graphite', transform: [{ translateX: 0, translateY: state.clampOffsetY }],
      },
    ],
  }),
});
