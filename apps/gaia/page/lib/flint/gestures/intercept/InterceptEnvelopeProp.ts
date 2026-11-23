/**
 * The envelope of Assistant intercept: the envelope of the shared vocabulary, turned and scaled around its own
 * centre, whose flap folds open and lets a small paper with two lines rise out of its top; and the tick of a handled incident. The open
 * flap is the back of the envelope, so it and the paper are drawn before the envelope's front. A hand can hold its lower corner.
 */
import type { Point }                                                  from '../../SpriteGeometry.ts';
import type { Shape }                                                  from '../../drawing/Shape.ts';
import { propDefinition }                                              from '../../props/PropDefinition.ts';
import type { EnvelopeOptions }                                        from '../../props/shapes/EnvelopeShape.ts';
import { envelopePlacementOf, envelopeShapesOf }                       from '../../props/shapes/EnvelopeShape.ts';
import { VerdictShapeUtil }                                            from '../../props/shapes/VerdictShapeUtil.ts';
import { INTERCEPT_ENVELOPE, INTERCEPT_HANDS, INTERCEPT_LETTER_SHAPE } from './constants/InterceptValues.ts';

export interface InterceptEnvelopeState {
  readonly shown:           number;
  /** The top left corner, before the turn and the scale. */
  readonly x:               number;
  readonly y:               number;
  readonly turnDegrees:     number;
  readonly scale:           number;
  readonly envelopeOpacity: number;
  /** Positive folds the flap down over the front, negative up behind the open top. */
  readonly flapDepth:       number;
  /** How far the paper stands out of the top, from 0 inside to `INTERCEPT_LETTER_SHAPE.PAPER_RISE_UNITS`. */
  readonly paperRise:       number;
  readonly tickOpacity:     number;
}

function paperShapesOf(state: InterceptEnvelopeState): readonly Shape[] {
  const paperX = state.x + INTERCEPT_LETTER_SHAPE.PAPER_INSET_X_UNITS;
  const paperY = state.y + INTERCEPT_LETTER_SHAPE.PAPER_INSET_Y_UNITS - state.paperRise;
  const paperOpacity = state.paperRise > 0 ? 1 : 0;
  return [
    {
      kind:        'rectangle',
      key:         'paper',
      x:           paperX,
      y:           paperY,
      width:       INTERCEPT_LETTER_SHAPE.PAPER_WIDTH_UNITS,
      height:      INTERCEPT_LETTER_SHAPE.PAPER_HEIGHT_UNITS,
      fill:        'paper',
      stroke:      'paperEdge',
      strokeWidth: INTERCEPT_LETTER_SHAPE.PAPER_STROKE_UNITS,
      opacity:     paperOpacity,
    },
    ...INTERCEPT_LETTER_SHAPE.LINE_Y_UNITS.map((lineY, i): Shape => ({
      kind:        'line',
      key:         `paper-line-${i}`,
      x1:          paperX + INTERCEPT_LETTER_SHAPE.LINE_INSET_X_UNITS,
      y1:          paperY + lineY,
      x2:          paperX + INTERCEPT_LETTER_SHAPE.PAPER_WIDTH_UNITS - INTERCEPT_LETTER_SHAPE.LINE_INSET_X_UNITS,
      y2:          paperY + lineY,
      stroke:      'paperEdge',
      strokeWidth: INTERCEPT_LETTER_SHAPE.LINE_STROKE_UNITS,
      lineCap:     'round',
      opacity:     paperOpacity,
    })),
  ];
}

/** The front, the flap and the seal of the vocabulary's envelope; the flap folds as the state gives, behind the paper once it is open. */
function envelopeShapesAt(state: InterceptEnvelopeState): readonly Shape[] {
  const flapKey = 'envelope-flap';
  const envelope: EnvelopeOptions = {
    key:         'envelope',
    x:           state.x,
    y:           state.y,
    turnDegrees: state.turnDegrees,
    scale:       state.scale,
    flapDepth:   state.flapDepth,
    opacity:     state.envelopeOpacity,
  };
  const vocabulary = envelopeShapesOf(envelope);
  const flap = vocabulary.filter((shape) => shape.key === flapKey);
  const front = vocabulary.filter((shape) => shape.key !== flapKey);
  const paper = paperShapesOf(state).map((shape): Shape => ({ ...shape, opacity: (shape.opacity ?? 1) * state.envelopeOpacity, ...envelopePlacementOf(envelope), }));
  return state.flapDepth < 0 ? [...flap, ...paper, ...front] : [...paper, ...front, ...flap];
}

export const INTERCEPT_ENVELOPE_PROP = propDefinition({
  name:   'interceptEnvelope',
  hidden: Object.freeze<InterceptEnvelopeState>({
    shown:           0,
    x:               INTERCEPT_ENVELOPE.HELD_X_UNITS,
    y:               INTERCEPT_ENVELOPE.HELD_Y_UNITS,
    turnDegrees:     0,
    scale:           1,
    envelopeOpacity: 1,
    flapDepth:       INTERCEPT_LETTER_SHAPE.CLOSED_FLAP_DEPTH_UNITS,
    paperRise:       0,
    tickOpacity:     0,
  }),
  layer:    'behind-body',
  gripOf:   (state: InterceptEnvelopeState): Point => ({ x: state.x + INTERCEPT_HANDS.GRIP_FROM_CORNER_X_UNITS, y: state.y + INTERCEPT_HANDS.GRIP_FROM_CORNER_Y_UNITS }),
  shapesOf: (state: InterceptEnvelopeState) => ({
    opacity: state.shown,
    shapes:  [
      ...envelopeShapesAt(state),
      VerdictShapeUtil.tickOf({
        key: 'tick', startX: INTERCEPT_ENVELOPE.TICK_START_X_UNITS, startY: INTERCEPT_ENVELOPE.TICK_START_Y_UNITS, opacity: state.tickOpacity,
      }),
    ],
  }),
});
