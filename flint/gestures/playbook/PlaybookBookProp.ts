/**
 * The small book of Playbook (`06-more-animations.md`): a page with four printed lines under a cover. The cover opens by narrowing to its
 * spine; the line Flint reads is in the body colour. A book has a spine side, so it is never mirrored: its spine stays on the left on the
 * screen whatever the facing.
 */
import type { Shape }          from '../../drawing/Shape.ts';
import { propDefinition }      from '../../props/PropDefinition.ts';
import { PLAYBOOK_BOOK_SHAPE } from './constants/PlaybookValues.ts';

export interface PlaybookBookState {
  readonly shown:         number;
  /** Multiplies the opacity: the fade in and out of the book within its cycle. */
  readonly cycleOpacity:  number;
  /** From 1, closed, to 0, the cover narrowed to its spine. */
  readonly coverWidth:    number;
  /** The line Flint reads, in the body colour; null reads none. */
  readonly readLineIndex: number | null;
}

const BOOK_CENTRE_X_UNITS = PLAYBOOK_BOOK_SHAPE.X_UNITS + (PLAYBOOK_BOOK_SHAPE.WIDTH_UNITS / 2);
const BOOK_CENTRE_Y_UNITS = PLAYBOOK_BOOK_SHAPE.Y_UNITS + (PLAYBOOK_BOOK_SHAPE.HEIGHT_UNITS / 2);

function pageShapesOf(state: PlaybookBookState): readonly Shape[] {
  const lines = PLAYBOOK_BOOK_SHAPE.LINE_Y_UNITS.map((lineY, i): Shape => ({
    kind:             'line',
    key:              `line-${i}`,
    x1:               PLAYBOOK_BOOK_SHAPE.LINE_START_X_UNITS,
    y1:               lineY,
    x2:               PLAYBOOK_BOOK_SHAPE.LINE_END_X_UNITS,
    y2:               lineY,
    stroke:           state.readLineIndex === i ? 'body' : 'paperText',
    strokeWidth:      PLAYBOOK_BOOK_SHAPE.LINE_STROKE_UNITS,
    lineCap:          'round',
    unmirroredAboutX: BOOK_CENTRE_X_UNITS,
  }));
  return [
    {
      kind:             'rectangle',
      key:              'page',
      x:                PLAYBOOK_BOOK_SHAPE.X_UNITS,
      y:                PLAYBOOK_BOOK_SHAPE.Y_UNITS,
      width:            PLAYBOOK_BOOK_SHAPE.WIDTH_UNITS,
      height:           PLAYBOOK_BOOK_SHAPE.HEIGHT_UNITS,
      cornerRadius:     PLAYBOOK_BOOK_SHAPE.CORNER_RADIUS_UNITS,
      fill:             'paper',
      stroke:           'paperEdge',
      strokeWidth:      PLAYBOOK_BOOK_SHAPE.PAGE_STROKE_UNITS,
      unmirroredAboutX: BOOK_CENTRE_X_UNITS,
    },
    ...lines,
  ];
}

/** The cover and its diamond narrow to the spine together; a cover narrowed to nothing is not drawn. */
function coverShapesOf(state: PlaybookBookState): readonly Shape[] {
  const spineX = PLAYBOOK_BOOK_SHAPE.X_UNITS;
  const narrowing = [
    { translateX: spineX, translateY: 0 },
    { scaleX: state.coverWidth, scaleY: 1 },
    { translateX: -spineX, translateY: 0 },
  ];
  const emblemHalf = PLAYBOOK_BOOK_SHAPE.EMBLEM_SIDE_UNITS / 2;
  const coverOpacity = state.coverWidth > 0 ? 1 : 0;
  return [
    {
      kind:             'rectangle',
      key:              'cover',
      x:                PLAYBOOK_BOOK_SHAPE.X_UNITS,
      y:                PLAYBOOK_BOOK_SHAPE.Y_UNITS,
      width:            PLAYBOOK_BOOK_SHAPE.WIDTH_UNITS,
      height:           PLAYBOOK_BOOK_SHAPE.HEIGHT_UNITS,
      cornerRadius:     PLAYBOOK_BOOK_SHAPE.CORNER_RADIUS_UNITS,
      fill:             'hand',
      opacity:          coverOpacity,
      transform:        narrowing,
      unmirroredAboutX: BOOK_CENTRE_X_UNITS,
    },
    {
      kind:             'rectangle',
      key:              'emblem',
      x:                BOOK_CENTRE_X_UNITS - emblemHalf,
      y:                BOOK_CENTRE_Y_UNITS - emblemHalf,
      width:            PLAYBOOK_BOOK_SHAPE.EMBLEM_SIDE_UNITS,
      height:           PLAYBOOK_BOOK_SHAPE.EMBLEM_SIDE_UNITS,
      fill:             'body',
      opacity:          coverOpacity,
      transform:        [...narrowing, { rotateDegrees: PLAYBOOK_BOOK_SHAPE.EMBLEM_TURN_DEGREES, aboutX: BOOK_CENTRE_X_UNITS, aboutY: BOOK_CENTRE_Y_UNITS }],
      unmirroredAboutX: BOOK_CENTRE_X_UNITS,
    },
    {
      kind:             'line',
      key:              'spine',
      x1:               spineX,
      y1:               PLAYBOOK_BOOK_SHAPE.Y_UNITS,
      x2:               spineX,
      y2:               PLAYBOOK_BOOK_SHAPE.Y_UNITS + PLAYBOOK_BOOK_SHAPE.HEIGHT_UNITS,
      stroke:           'graphite',
      strokeWidth:      PLAYBOOK_BOOK_SHAPE.SPINE_STROKE_UNITS,
      lineCap:          'round',
      unmirroredAboutX: BOOK_CENTRE_X_UNITS,
    },
  ];
}

export const PLAYBOOK_BOOK_PROP = propDefinition({
  name:   'playbookBook',
  hidden: Object.freeze<PlaybookBookState>({
    shown: 0, cycleOpacity: 1, coverWidth: 1, readLineIndex: null,
  }),
  layer:    'behind-body',
  shapesOf: (state: PlaybookBookState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [...pageShapesOf(state), ...coverShapesOf(state)],
  }),
});
