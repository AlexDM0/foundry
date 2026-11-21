/** The sweat drop of `01-character.md`, with its highlight. */
import { markDefinition, NO_MARK_DETAILS } from '../MarkDefinition.ts';
import { SWEAT_DROP_SHAPE }                from './constants/SweatDropValues.ts';

export const SWEAT_DROP_MARK = markDefinition({
  name:        'sweat-drop',
  anchorX:     SWEAT_DROP_SHAPE.ANCHOR_X_UNITS,
  anchorY:     SWEAT_DROP_SHAPE.ANCHOR_Y_UNITS,
  scale:       SWEAT_DROP_SHAPE.SCALE,
  restDetails: NO_MARK_DETAILS,
  shapesOf:    () => [
    {
      kind: 'path', key: 'drop', pathData: SWEAT_DROP_SHAPE.PATH, fill: 'water',
    },
    {
      kind:   'rectangle',
      key:    'highlight',
      x:      SWEAT_DROP_SHAPE.HIGHLIGHT_X_UNITS,
      y:      SWEAT_DROP_SHAPE.HIGHLIGHT_Y_UNITS,
      width:  SWEAT_DROP_SHAPE.HIGHLIGHT_WIDTH_UNITS,
      height: SWEAT_DROP_SHAPE.HIGHLIGHT_HEIGHT_UNITS,
      fill:   'waterLight',
    },
  ],
});
